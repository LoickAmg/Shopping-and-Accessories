import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { cartItems, carts, products } from "@/db/schema";
import type { Product } from "@/db/schema";

/** Quantité maximale d'un même article dans un panier. */
export const MAX_PER_LINE = 10;

export interface CartLine {
  product: Product;
  quantity: number;
  lineTotalCents: number;
  /** Stock actuel : peut être inférieur à la quantité demandée si le catalogue a changé depuis. */
  available: number;
  /** Vrai si l'article n'est plus achetable en l'état (retiré, épuisé, quantité supérieure au stock). */
  problem: "unavailable" | "insufficient" | null;
}

export interface CartView {
  cartId: string | null;
  lines: CartLine[];
  itemCount: number;
  subtotalCents: number;
  /** Vrai si au moins une ligne bloque la commande. */
  hasProblem: boolean;
}

const EMPTY: CartView = { cartId: null, lines: [], itemCount: 0, subtotalCents: 0, hasProblem: false };

export class UnavailableProductError extends Error {
  constructor(message = "Cet article n'est plus disponible.") {
    super(message);
    this.name = "UnavailableProductError";
  }
}

function clampQuantity(quantity: number, stock: number): number {
  return Math.max(0, Math.min(Math.floor(quantity), MAX_PER_LINE, stock));
}

export async function getCartView(db: Db, cartId: string | undefined | null): Promise<CartView> {
  if (!cartId) return EMPTY;

  const rows = await db
    .select({ product: products, quantity: cartItems.quantity })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(products.name));

  if (rows.length === 0) return { ...EMPTY, cartId };

  const lines: CartLine[] = rows.map(({ product, quantity }) => {
    const purchasable = product.active && product.stock > 0;
    const problem = !purchasable ? "unavailable" : quantity > product.stock ? "insufficient" : null;
    return {
      product,
      quantity,
      lineTotalCents: product.priceCents * quantity,
      available: product.active ? product.stock : 0,
      problem,
    };
  });

  return {
    cartId,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    hasProblem: lines.some((line) => line.problem !== null),
  };
}

/** Panier existant d'un compte, s'il en a un. */
export async function findCartIdForUser(db: Db, userId: string): Promise<string | undefined> {
  const [row] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, userId)).limit(1);
  return row?.id;
}

async function ensureCart(db: Db, cartId: string | undefined | null, userId: string | null): Promise<string> {
  if (cartId) {
    const [existing] = await db.select({ id: carts.id }).from(carts).where(eq(carts.id, cartId)).limit(1);
    if (existing) return existing.id;
  }
  if (userId) {
    const existing = await findCartIdForUser(db, userId);
    if (existing) return existing;
  }
  const [created] = await db.insert(carts).values({ userId }).returning({ id: carts.id });
  return created.id;
}

/**
 * Ajoute `quantity` exemplaires d'un produit et renvoie l'identifiant du panier
 * (créé au besoin). La quantité totale est plafonnée par le stock et par
 * `MAX_PER_LINE` ; un produit retiré ou épuisé ne peut pas être ajouté.
 */
export async function addToCart(
  db: Db,
  input: { cartId?: string | null; userId?: string | null; productId: number; quantity: number },
): Promise<{ cartId: string; quantity: number }> {
  const [product] = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
  if (!product || !product.active) throw new UnavailableProductError();
  if (product.stock <= 0) throw new UnavailableProductError("Cet article est en rupture de stock.");

  const cartId = await ensureCart(db, input.cartId, input.userId ?? null);

  const [current] = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, product.id)))
    .limit(1);

  const target = clampQuantity((current?.quantity ?? 0) + Math.max(1, Math.floor(input.quantity)), product.stock);

  await db
    .insert(cartItems)
    .values({ cartId, productId: product.id, quantity: target })
    .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.productId], set: { quantity: target } });
  await touchCart(db, cartId);
  return { cartId, quantity: target };
}

/** Fixe la quantité d'une ligne ; 0 (ou moins) la supprime. */
export async function setQuantity(db: Db, cartId: string, productId: number, quantity: number): Promise<void> {
  if (quantity <= 0) {
    await removeFromCart(db, cartId, productId);
    return;
  }
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product || !product.active || product.stock <= 0) {
    await removeFromCart(db, cartId, productId);
    return;
  }
  await db
    .update(cartItems)
    .set({ quantity: clampQuantity(quantity, product.stock) })
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));
  await touchCart(db, cartId);
}

export async function removeFromCart(db: Db, cartId: string, productId: number): Promise<void> {
  await db.delete(cartItems).where(and(eq(cartItems.cartId, cartId), eq(cartItems.productId, productId)));
  await touchCart(db, cartId);
}

async function touchCart(db: Db, cartId: string): Promise<void> {
  await db.update(carts).set({ updatedAt: sql`now()` }).where(eq(carts.id, cartId));
}

/**
 * À la connexion : fusionne le panier d'invité dans celui du compte (les
 * quantités s'additionnent, plafonnées par le stock) puis supprime le premier.
 * Renvoie l'identifiant du panier à utiliser désormais.
 */
export async function mergeGuestCart(db: Db, guestCartId: string | undefined | null, userId: string): Promise<string | undefined> {
  const userCartId = await findCartIdForUser(db, userId);
  if (!guestCartId || guestCartId === userCartId) return userCartId;

  const [guest] = await db.select({ id: carts.id, userId: carts.userId }).from(carts).where(eq(carts.id, guestCartId)).limit(1);
  if (!guest || guest.userId) return userCartId;

  if (!userCartId) {
    await db.update(carts).set({ userId }).where(eq(carts.id, guest.id));
    return guest.id;
  }

  const guestItems = await db.select().from(cartItems).where(eq(cartItems.cartId, guest.id));
  const productRows = guestItems.length
    ? await db.select().from(products).where(inArray(products.id, guestItems.map((item) => item.productId)))
    : [];
  const stockById = new Map(productRows.map((product) => [product.id, product.stock]));

  for (const item of guestItems) {
    const stock = stockById.get(item.productId) ?? 0;
    if (stock <= 0) continue;
    const [existing] = await db
      .select({ quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, userCartId), eq(cartItems.productId, item.productId)))
      .limit(1);
    const merged = clampQuantity((existing?.quantity ?? 0) + item.quantity, stock);
    await db
      .insert(cartItems)
      .values({ cartId: userCartId, productId: item.productId, quantity: merged })
      .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.productId], set: { quantity: merged } });
  }

  await db.delete(carts).where(eq(carts.id, guest.id));
  await touchCart(db, userCartId);
  return userCartId;
}
