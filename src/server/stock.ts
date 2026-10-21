import { and, asc, count, desc, eq, gt, ilike, lte, or, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { categories, productVariants, products, stockMovements, users } from "@/db/schema";
import type { StockReason } from "@/db/schema";
import { normalizeForSearch } from "@/lib/slug";
import { variantLabel } from "@/lib/taxonomy";

import { LOW_STOCK_THRESHOLD } from "./admin";
import { escapeLike } from "./catalog";

/** Base de données ou transaction : les deux exposent les mêmes requêtes. */
type Executor = Pick<Db, "insert" | "update" | "select" | "execute">;

export async function recordMovement(
  db: Executor,
  movement: { variantId: number; delta: number; stockAfter?: number | null; reason: StockReason; orderId?: string | null; actorId?: string | null },
): Promise<void> {
  if (movement.delta === 0) return;
  await db.insert(stockMovements).values({
    variantId: movement.variantId,
    delta: movement.delta,
    stockAfter: movement.stockAfter ?? null,
    reason: movement.reason,
    orderId: movement.orderId ?? null,
    actorId: movement.actorId ?? null,
  });
}

export interface StockChange {
  variantId: number;
  /** Stock affiché quand la page a été ouverte. */
  from: number;
  /** Stock saisi. */
  to: number;
}

export interface StockAdjustResult {
  applied: { variantId: number; delta: number; stock: number }[];
  /** Déclinaisons dont le stock a trop baissé entre-temps (ventes) pour appliquer la correction. */
  rejected: number[];
}

/**
 * Applique des corrections de stock **en écart** (saisi − affiché) plutôt
 * qu'en valeur absolue : une vente passée pendant que la page était ouverte
 * n'est pas écrasée. Un écart qui rendrait le stock négatif est refusé.
 */
export async function adjustStock(db: Db, changes: StockChange[], actorId: string | null): Promise<StockAdjustResult> {
  const result: StockAdjustResult = { applied: [], rejected: [] };
  for (const change of changes) {
    const delta = change.to - change.from;
    if (delta === 0) continue;
    const [row] = await db
      .update(productVariants)
      .set({ stock: sql`${productVariants.stock} + ${delta}` })
      .where(and(eq(productVariants.id, change.variantId), sql`${productVariants.stock} + ${delta} >= 0`))
      .returning({ stock: productVariants.stock });
    if (!row) {
      result.rejected.push(change.variantId);
      continue;
    }
    await recordMovement(db, { variantId: change.variantId, delta, stockAfter: row.stock, reason: "ajustement", actorId });
    result.applied.push({ variantId: change.variantId, delta, stock: row.stock });
  }
  return result;
}

export const STOCK_PAGE_SIZE = 60;

export interface StockFilter {
  q?: string;
  /** `bas` : sous le seuil d'alerte ; `rupture` : épuisé. */
  level?: "bas" | "rupture";
  productId?: number;
  page?: number;
}

export interface StockRow {
  variantId: number;
  productId: number;
  productName: string;
  productActive: boolean;
  imageUrl: string | null;
  categoryName: string | null;
  label: string;
  sku: string | null;
  stock: number;
}

/** Déclinaisons actives, pour la page de stock (une ligne par taille ou couleur). */
export async function listStockRows(db: Db, filter: StockFilter = {}): Promise<{ rows: StockRow[]; total: number }> {
  const conditions = [eq(productVariants.active, true)];
  const needle = normalizeForSearch((filter.q ?? "").trim());
  if (needle) {
    const pattern = `%${escapeLike(needle)}%`;
    const condition = or(ilike(products.searchText, pattern), ilike(products.sku, pattern), ilike(productVariants.sku, pattern), ilike(productVariants.size, pattern));
    if (condition) conditions.push(condition);
  }
  if (filter.productId) conditions.push(eq(products.id, filter.productId));
  if (filter.level === "rupture") conditions.push(lte(productVariants.stock, 0));
  if (filter.level === "bas") conditions.push(and(gt(productVariants.stock, 0), lte(productVariants.stock, LOW_STOCK_THRESHOLD)) ?? sql`true`);
  const where = and(...conditions);
  const page = Math.max(1, filter.page ?? 1);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        variantId: productVariants.id,
        productId: products.id,
        productName: products.name,
        productActive: products.active,
        imageUrl: products.imageUrl,
        categoryName: categories.name,
        size: productVariants.size,
        color: productVariants.color,
        sku: productVariants.sku,
        stock: productVariants.stock,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(desc(products.active), asc(products.name), asc(productVariants.position), asc(productVariants.id))
      .limit(STOCK_PAGE_SIZE)
      .offset((page - 1) * STOCK_PAGE_SIZE),
    db
      .select({ total: count() })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(where),
  ]);
  return {
    rows: rows.map(({ size, color, ...row }) => ({ ...row, label: variantLabel({ size, color }) })),
    total,
  };
}

export interface MovementRow {
  id: number;
  createdAt: Date;
  delta: number;
  stockAfter: number | null;
  reason: StockReason;
  orderId: string | null;
  actorEmail: string | null;
  productId: number;
  productName: string;
  label: string;
}

/** Derniers mouvements de stock, de toute la boutique ou d'un produit. */
export async function listMovements(db: Db, options: { productId?: number; limit?: number } = {}): Promise<MovementRow[]> {
  const rows = await db
    .select({
      id: stockMovements.id,
      createdAt: stockMovements.createdAt,
      delta: stockMovements.delta,
      stockAfter: stockMovements.stockAfter,
      reason: stockMovements.reason,
      orderId: stockMovements.orderId,
      actorEmail: users.email,
      productId: products.id,
      productName: products.name,
      size: productVariants.size,
      color: productVariants.color,
    })
    .from(stockMovements)
    .innerJoin(productVariants, eq(stockMovements.variantId, productVariants.id))
    .innerJoin(products, eq(productVariants.productId, products.id))
    .leftJoin(users, eq(stockMovements.actorId, users.id))
    .where(options.productId ? eq(products.id, options.productId) : undefined)
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(options.limit ?? 50);
  return rows.map(({ size, color, ...row }) => ({ ...row, label: variantLabel({ size, color }) }));
}

export const STOCK_REASON_LABELS: Record<StockReason, string> = {
  ajustement: "Correction",
  vente: "Vente",
  restitution: "Retour au stock",
};
