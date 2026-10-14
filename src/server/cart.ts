import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { cartItems, carts, productVariants, products } from "@/db/schema";
import type { Product, ProductVariant } from "@/db/schema";
import { variantLabel } from "@/lib/taxonomy";

/** Quantité maximale d'un même article (même déclinaison) dans un panier. */
export const MAX_PER_LINE = 10;

export interface CartLine {
  product: Product;
  variant: ProductVariant;
  /** « Taille M · Noir », vide pour un article sans déclinaison. */
  variantLabel: string;
  quantity: number;
  lineTotalCents: number;
  /** Stock actuel de la déclinaison : peut être inférieur à la quantité demandée si le catalogue a changé depuis. */
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

/** Une déclinaison est achetable si elle et son produit sont actifs. Renvoie son stock achetable (0 sinon). */
function purchasableStock(product: Pick<Product, "active">, variant: Pick<ProductVariant, "active" | "stock">): number {
  return product.active && variant.active ? variant.stock : 0;
}

export async function getCartView(db: Db, cartId: string | undefined | null): Promise<CartView> {
  if (!cartId) return EMPTY;

  const rows = await db
    .select({ product: products, variant: productVariants, quantity: cartItems.quantity })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(cartItems.cartId, cartId))
    .orderBy(asc(products.name), asc(productVariants.position), asc(productVariants.id));

  if (rows.length === 0) return { ...EMPTY, cartId };

  const lines: CartLine[] = rows.map(({ product, variant, quantity }) => {
    const available = purchasableStock(product, variant);
    const problem = available <= 0 ? "unavailable" : quantity > available ? "insufficient" : null;
    return {
      product,
      variant,
      variantLabel: variantLabel(variant),
      quantity,
      lineTotalCents: product.priceCents * quantity,
      available,
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

async function loadVariant(db: Db, variantId: number): Promise<{ product: Product; variant: ProductVariant } | undefined> {
  const [row] = await db
    .select({ product: products, variant: productVariants })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(eq(productVariants.id, variantId))
    .limit(1);
  return row;
}

/**
 * Ajoute `quantity` exemplaires d'une déclinaison et renvoie l'identifiant du
 * panier (créé au besoin). La quantité totale est plafonnée par le stock de la
 * déclinaison et par `MAX_PER_LINE` ; un article retiré ou épuisé ne peut pas
 * être ajouté. `productId`, s'il est fourni, doit correspondre à la déclinaison :
 * le formulaire ne peut pas glisser la taille d'un autre produit.
 */
export async function addToCart(
  db: Db,
  input: { cartId?: string | null; userId?: string | null; variantId: number; productId?: number; quantity: number },
): Promise<{ cartId: string; quantity: number }> {
  const found = await loadVariant(db, input.variantId);
  if (!found || (input.productId != null && found.product.id !== input.productId)) throw new UnavailableProductError();
  const stock = purchasableStock(found.product, found.variant);
  if (!found.product.active || !found.variant.active) throw new UnavailableProductError();
  if (stock <= 0) throw new UnavailableProductError("Cet article est en rupture de stock.");

  const cartId = await ensureCart(db, input.cartId, input.userId ?? null);

  const [current] = await db
    .select({ quantity: cartItems.quantity })
    .from(cartItems)
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, found.variant.id)))
    .limit(1);

  const target = clampQuantity((current?.quantity ?? 0) + Math.max(1, Math.floor(input.quantity)), stock);

  await db
    .insert(cartItems)
    .values({ cartId, variantId: found.variant.id, quantity: target })
    .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.variantId], set: { quantity: target } });
  await touchCart(db, cartId);
  return { cartId, quantity: target };
}

/** Fixe la quantité d'une ligne ; 0 (ou moins) la supprime. */
export async function setQuantity(db: Db, cartId: string, variantId: number, quantity: number): Promise<void> {
  if (quantity <= 0) {
    await removeFromCart(db, cartId, variantId);
    return;
  }
  const found = await loadVariant(db, variantId);
  const stock = found ? purchasableStock(found.product, found.variant) : 0;
  if (stock <= 0) {
    await removeFromCart(db, cartId, variantId);
    return;
  }
  await db
    .update(cartItems)
    .set({ quantity: clampQuantity(quantity, stock) })
    .where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
  await touchCart(db, cartId);
}

export async function removeFromCart(db: Db, cartId: string, variantId: number): Promise<void> {
  await db.delete(cartItems).where(and(eq(cartItems.cartId, cartId), eq(cartItems.variantId, variantId)));
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
  const variantRows = guestItems.length
    ? await db
        .select({ product: products, variant: productVariants })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .where(inArray(productVariants.id, guestItems.map((item) => item.variantId)))
    : [];
  const stockById = new Map(variantRows.map((row) => [row.variant.id, purchasableStock(row.product, row.variant)]));

  for (const item of guestItems) {
    const stock = stockById.get(item.variantId) ?? 0;
    if (stock <= 0) continue;
    const [existing] = await db
      .select({ quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.cartId, userCartId), eq(cartItems.variantId, item.variantId)))
      .limit(1);
    const merged = clampQuantity((existing?.quantity ?? 0) + item.quantity, stock);
    await db
      .insert(cartItems)
      .values({ cartId: userCartId, variantId: item.variantId, quantity: merged })
      .onConflictDoUpdate({ target: [cartItems.cartId, cartItems.variantId], set: { quantity: merged } });
  }

  await db.delete(carts).where(eq(carts.id, guest.id));
  await touchCart(db, userCartId);
  return userCartId;
}
