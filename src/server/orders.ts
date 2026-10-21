import { randomBytes, timingSafeEqual } from "node:crypto";

import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { cartItems, orderItems, orders, productVariants, products } from "@/db/schema";
import type { Order, OrderItem, OrderStatus, ShippingAddress } from "@/db/schema";
import { convertMinor } from "@/lib/currency";
import type { RateTarget } from "@/lib/currency";
import { variantLabel } from "@/lib/taxonomy";

import { computeTotals } from "./pricing";
import { notifyLowStock } from "./stock-alerts";
import { recordMovement } from "./stock";
import type { ShippingRules } from "./pricing";

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export class EmptyCartError extends Error {
  constructor() {
    super("Le panier est vide.");
    this.name = "EmptyCartError";
  }
}

export class OutOfStockError extends Error {
  constructor(public readonly productNames: string[]) {
    super(`Stock insuffisant : ${productNames.join(", ")}.`);
    this.name = "OutOfStockError";
  }
}

export interface CreateOrderInput {
  cartId: string;
  userId: string | null;
  email: string;
  customerName: string;
  address: ShippingAddress;
  paymentProvider: string;
  /** Code de la devise dans laquelle la commande est enregistrée et facturée. */
  currency: string;
  /**
   * Frais de port. Sans `convert`, ils doivent déjà être exprimés dans
   * `currency` (comportement historique). Avec `convert`, ils sont exprimés
   * dans la devise de base et convertis comme les prix du catalogue.
   */
  shipping: ShippingRules;
  reservationMinutes: number;
  /**
   * Convertit les prix du catalogue (toujours en devise de base) et les frais
   * de port vers `currency` avant de les figer sur la commande. Omis quand
   * `currency` est déjà la devise de base : aucune conversion n'a lieu, les
   * montants sont pris tels quels (c'est le cas par défaut).
   */
  convert?: RateTarget & { baseExponent: number };
}

/** Une transaction Drizzle se comporte comme la base : on lui passe les mêmes fonctions. */
type Tx = Db;

function newAccessToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Transforme un panier en commande **et réserve le stock dans la même transaction**.
 * Chaque article est retiré du stock par un `UPDATE … WHERE stock >= quantité` :
 * le test et le retrait sont indivisibles, deux acheteurs ne peuvent donc jamais
 * se partager la dernière pièce. Si un seul article manque, tout est annulé.
 */
export async function createOrder(db: Db, input: CreateOrderInput): Promise<OrderWithItems> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;

    const lines = await tx
      .select({
        variantId: cartItems.variantId,
        productId: productVariants.productId,
        quantity: cartItems.quantity,
        name: products.name,
        size: productVariants.size,
        color: productVariants.color,
      })
      .from(cartItems)
      .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(eq(cartItems.cartId, input.cartId))
      .orderBy(asc(cartItems.variantId));

    if (lines.length === 0) throw new EmptyCartError();

    const reserved: { productId: number; variantId: number; name: string; variantLabel: string; unitPriceCents: number; quantity: number; stockAfter: number }[] = [];
    const missing: string[] = [];
    const convert = input.convert;

    for (const line of lines) {
      const label = variantLabel(line);
      const stockAfter = await takeStock(tx, line.variantId, line.quantity);
      if (stockAfter != null) {
        // Le prix est relu dans la même transaction : jamais celui d'un formulaire.
        const [product] = await tx.select({ priceCents: products.priceCents }).from(products).where(eq(products.id, line.productId)).limit(1);
        const unitPriceCents = convert ? convertMinor(product.priceCents, convert, convert.baseExponent) : product.priceCents;
        reserved.push({ productId: line.productId, variantId: line.variantId, name: line.name, variantLabel: label, unitPriceCents, quantity: line.quantity, stockAfter });
      } else {
        missing.push(label ? `${line.name} (${label})` : line.name);
      }
    }

    if (missing.length > 0) throw new OutOfStockError(missing);

    const shippingRules: ShippingRules = convert
      ? {
          flatCents: convertMinor(input.shipping.flatCents, convert, convert.baseExponent),
          freeOverCents: convertMinor(input.shipping.freeOverCents, convert, convert.baseExponent),
        }
      : input.shipping;

    const subtotal = reserved.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
    const totals = computeTotals(subtotal, shippingRules);
    const expiresAt = new Date(Date.now() + input.reservationMinutes * 60 * 1000);

    const [order] = await tx
      .insert(orders)
      .values({
        userId: input.userId,
        email: input.email.trim().toLowerCase(),
        customerName: input.customerName.trim(),
        shippingAddress: input.address,
        currency: input.currency,
        subtotalCents: totals.subtotalCents,
        shippingCents: totals.shippingCents,
        totalCents: totals.totalCents,
        paymentProvider: input.paymentProvider,
        accessToken: newAccessToken(),
        expiresAt,
      })
      .returning();

    const items = await tx
      .insert(orderItems)
      .values(
        reserved.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          variantId: item.variantId,
          name: item.name,
          variantLabel: item.variantLabel,
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
        })),
      )
      .returning();

    for (const item of reserved) {
      await recordMovement(tx, { variantId: item.variantId, delta: -item.quantity, stockAfter: item.stockAfter, reason: "vente", orderId: order.id });
    }
    await tx.delete(cartItems).where(eq(cartItems.cartId, input.cartId));
    return { ...order, items };
  }).then(async (created) => {
    void notifyLowStock(db).catch(() => undefined);
    return created;
  });
}

/**
 * Retire `quantity` du stock d'une déclinaison, en une seule instruction :
 * le test « assez de stock, article actif » et le retrait sont indivisibles,
 * deux acheteurs ne peuvent donc jamais se partager la dernière pièce.
 * Renvoie le stock restant, ou `null` si le retrait est impossible.
 */
async function takeStock(tx: Tx, variantId: number, quantity: number): Promise<number | null> {
  const rows = await tx
    .update(productVariants)
    .set({ stock: sql`${productVariants.stock} - ${quantity}` })
    .where(
      and(
        eq(productVariants.id, variantId),
        eq(productVariants.active, true),
        gte(productVariants.stock, quantity),
        sql`exists (select 1 from ${products} where ${products.id} = ${productVariants.productId} and ${products.active})`,
      ),
    )
    .returning({ id: productVariants.id, stock: productVariants.stock });
  return rows[0]?.stock ?? null;
}

/** Restitue au stock les quantités d'une commande. */
async function restock(tx: Tx, orderId: string): Promise<void> {
  await tx.execute(sql`
    update product_variants v set stock = v.stock + oi.quantity
    from order_items oi
    where oi.order_id = ${orderId} and oi.variant_id = v.id
  `);
  await tx.execute(sql`
    insert into stock_movements (variant_id, delta, stock_after, reason, order_id)
    select oi.variant_id, oi.quantity, v.stock, 'restitution', ${orderId}
    from order_items oi join product_variants v on v.id = oi.variant_id
    where oi.order_id = ${orderId} and oi.quantity > 0
  `);
}

/**
 * Annule les commandes impayées dont la réservation a expiré et rend leur
 * stock. Idempotent : une commande n'est traitée qu'une fois, même si deux
 * appels se croisent. Renvoie le nombre de commandes expirées.
 */
export async function expireStaleOrders(db: Db, now: Date = new Date()): Promise<number> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    const expired = await tx
      .update(orders)
      .set({ status: "expired" })
      .where(and(eq(orders.status, "pending"), lt(orders.expiresAt, now)))
      .returning({ id: orders.id });
    for (const { id } of expired) await restock(tx, id);
    return expired.length;
  });
}

export type PaymentOutcome =
  | { outcome: "paid" }
  | { outcome: "paid_after_expiry" }
  | { outcome: "already_paid" }
  /** Paiement reçu mais commande non honorable (stock repris, ou commande annulée) : remboursement à faire. */
  | { outcome: "needs_refund"; reason: "out_of_stock" | "order_cancelled" }
  | { outcome: "unknown_order" };

class LateStockError extends Error {}

/**
 * Marque une commande payée. Cas d'une commande déjà expirée : on tente de
 * re-réserver le stock ; si c'est impossible, la commande reste en l'état et le
 * résultat `needs_refund` prévient qu'un paiement est à rembourser.
 */
export async function markOrderPaid(db: Db, orderId: string, payment: { reference: string }): Promise<PaymentOutcome> {
  const paidNow = await db
    .update(orders)
    .set({ status: "paid", paidAt: new Date(), paymentReference: payment.reference })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")))
    .returning({ id: orders.id });
  if (paidNow.length > 0) return { outcome: "paid" };

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { outcome: "unknown_order" };
  if (order.status === "paid" || order.status === "fulfilled") return { outcome: "already_paid" };

  if (order.status === "cancelled") {
    await db.update(orders).set({ paymentReference: payment.reference }).where(eq(orders.id, orderId));
    return { outcome: "needs_refund", reason: "order_cancelled" };
  }

  try {
    await db.transaction(async (rawTx) => {
      const tx = rawTx as unknown as Tx;
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.variantId));
      for (const item of items) {
        const stockAfter = item.variantId == null ? null : await takeStock(tx, item.variantId, item.quantity);
        if (item.variantId == null || stockAfter == null) throw new LateStockError();
        await recordMovement(tx, { variantId: item.variantId, delta: -item.quantity, stockAfter, reason: "vente", orderId });
      }
      await tx
        .update(orders)
        .set({ status: "paid", paidAt: new Date(), paymentReference: payment.reference })
        .where(and(eq(orders.id, orderId), eq(orders.status, "expired")));
    });
    void notifyLowStock(db).catch(() => undefined);
    return { outcome: "paid_after_expiry" };
  } catch (error) {
    if (!(error instanceof LateStockError)) throw error;
    await db.update(orders).set({ paymentReference: payment.reference }).where(eq(orders.id, orderId));
    return { outcome: "needs_refund", reason: "out_of_stock" };
  }
}

/** Annule une commande pas encore expédiée et rend son stock. */
export async function cancelOrder(db: Db, orderId: string): Promise<boolean> {
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    const cancelled = await tx
      .update(orders)
      .set({ status: "cancelled" })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["pending", "paid"])))
      .returning({ id: orders.id });
    if (cancelled.length === 0) return false;
    await restock(tx, orderId);
    return true;
  });
}

/**
 * Annule une commande dont le paiement n'a pas pu démarrer : le stock est rendu
 * et les articles retournent dans le panier, comme si rien ne s'était passé.
 */
export async function cancelOrderAndRestoreCart(db: Db, orderId: string, cartId: string): Promise<boolean> {
  const order = await getOrder(db, orderId);
  if (!order) return false;
  if (!(await cancelOrder(db, orderId))) return false;

  const restorable = order.items.filter((item) => item.variantId != null);
  if (restorable.length > 0) {
    await db
      .insert(cartItems)
      .values(restorable.map((item) => ({ cartId, variantId: item.variantId as number, quantity: item.quantity })))
      .onConflictDoNothing();
  }
  return true;
}

/**
 * Solde un paiement à rembourser : une commande annulée ou expirée pour laquelle
 * de l'argent a été reçu passe en « remboursée » une fois le remboursement fait
 * chez le fournisseur.
 */
export async function markOrderRefunded(db: Db, orderId: string): Promise<boolean> {
  const done = await db
    .update(orders)
    .set({ status: "refunded" })
    .where(and(eq(orders.id, orderId), inArray(orders.status, ["cancelled", "expired"]), isNotNull(orders.paymentReference)))
    .returning({ id: orders.id });
  return done.length > 0;
}

/** Enregistre un paiement reçu hors agrégateur (virement, espèces, mobile money manuel). */
export async function markOrderPaidManually(db: Db, orderId: string, note: string): Promise<PaymentOutcome> {
  return markOrderPaid(db, orderId, { reference: `manuel:${note.trim().slice(0, 80) || "sans référence"}` });
}

export interface Tracking {
  carrier: string;
  number: string;
  url: string;
}

/** Passe une commande payée en « expédiée », avec un suivi facultatif (transporteur, numéro, lien). */
export async function fulfillOrder(db: Db, orderId: string, tracking: Tracking = { carrier: "", number: "", url: "" }): Promise<OrderWithItems | undefined> {
  const [done] = await db
    .update(orders)
    .set({
      status: "fulfilled",
      shippedAt: new Date(),
      trackingCarrier: tracking.carrier.trim().slice(0, 60),
      trackingNumber: tracking.number.trim().slice(0, 80),
      trackingUrl: tracking.url.trim().slice(0, 300),
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, "paid")))
    .returning();
  return done ? withItems(db, done) : undefined;
}

async function withItems(db: Db, order: Order): Promise<OrderWithItems> {
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id));
  return { ...order, items };
}

export async function getOrder(db: Db, orderId: string): Promise<OrderWithItems | undefined> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return order ? withItems(db, order) : undefined;
}

/** Consultation d'une commande sans compte : l'identifiant ET le jeton doivent correspondre. */
export async function getOrderWithToken(db: Db, orderId: string, token: string): Promise<OrderWithItems | undefined> {
  const order = await getOrder(db, orderId);
  if (!order) return undefined;
  const expected = Buffer.from(order.accessToken);
  const supplied = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? order : undefined;
}

export async function listOrdersForUser(db: Db, userId: string): Promise<OrderWithItems[]> {
  const rows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  return Promise.all(rows.map((row) => withItems(db, row)));
}

export interface OrderListFilter {
  status?: OrderStatus;
  page?: number;
  pageSize?: number;
}

export async function listOrders(db: Db, filter: OrderListFilter = {}) {
  const pageSize = Math.min(Math.max(filter.pageSize ?? 20, 1), 100);
  const where = filter.status ? eq(orders.status, filter.status) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(orders).where(where);
  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(Math.floor(filter.page ?? 1), 1), pageCount);
  const rows = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return { items: rows, total, page, pageCount };
}
