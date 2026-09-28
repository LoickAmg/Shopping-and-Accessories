import { and, asc, count, desc, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { categories, orders, products } from "@/db/schema";
import type { NewProduct, Product } from "@/db/schema";
import { buildSearchText, slugify } from "@/lib/slug";

export interface ProductInput {
  name: string;
  slug?: string;
  summary: string;
  description: string;
  categoryId: number | null;
  priceCents: number;
  compareAtCents: number | null;
  stock: number;
  active: boolean;
  tone: string;
  imageUrl: string | null;
  sku: string | null;
}

/** Trouve un identifiant d'URL libre : « vase », puis « vase-2 », « vase-3 »… */
export async function uniqueProductSlug(db: Db, base: string, ignoreId?: number): Promise<string> {
  const root = slugify(base) || "produit";
  for (let attempt = 1; attempt < 200; attempt += 1) {
    const candidate = attempt === 1 ? root : `${root}-${attempt}`;
    const [existing] = await db.select({ id: products.id }).from(products).where(eq(products.slug, candidate)).limit(1);
    if (!existing || existing.id === ignoreId) return candidate;
  }
  return `${root}-${Date.now()}`;
}

async function searchTextFor(db: Db, input: ProductInput): Promise<string> {
  let categoryName = "";
  if (input.categoryId != null) {
    const [category] = await db.select({ name: categories.name }).from(categories).where(eq(categories.id, input.categoryId)).limit(1);
    categoryName = category?.name ?? "";
  }
  return buildSearchText(input.name, input.summary, input.description, categoryName);
}

export async function createProduct(db: Db, input: ProductInput): Promise<Product> {
  const values: NewProduct = {
    ...input,
    slug: await uniqueProductSlug(db, input.slug || input.name),
    searchText: await searchTextFor(db, input),
  };
  const [row] = await db.insert(products).values(values).returning();
  return row;
}

export async function updateProduct(db: Db, id: number, input: ProductInput): Promise<Product | undefined> {
  const [row] = await db
    .update(products)
    .set({
      ...input,
      slug: await uniqueProductSlug(db, input.slug || input.name, id),
      searchText: await searchTextFor(db, input),
      updatedAt: sql`now()`,
    })
    .where(eq(products.id, id))
    .returning();
  return row;
}

export async function setProductActive(db: Db, id: number, active: boolean): Promise<void> {
  await db.update(products).set({ active, updatedAt: sql`now()` }).where(eq(products.id, id));
}

export async function listProductsForAdmin(db: Db) {
  return db
    .select({ product: products, categoryName: categories.name })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .orderBy(desc(products.active), asc(products.name));
}

export async function getProductForAdmin(db: Db, id: number): Promise<Product | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return row;
}

export interface CategoryInput {
  name: string;
  description: string;
  position: number;
}

export async function createCategory(db: Db, input: CategoryInput): Promise<void> {
  const root = slugify(input.name) || "rayon";
  let slug = root;
  for (let attempt = 2; attempt < 100; attempt += 1) {
    const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
    if (!existing) break;
    slug = `${root}-${attempt}`;
  }
  await db.insert(categories).values({ ...input, slug });
}

export async function updateCategory(db: Db, id: number, input: CategoryInput): Promise<void> {
  await db.update(categories).set(input).where(eq(categories.id, id));
  const rows = await db.select().from(products).where(eq(products.categoryId, id));
  for (const product of rows) {
    await db.update(products).set({ searchText: buildSearchText(product.name, product.summary, product.description, input.name) }).where(eq(products.id, product.id));
  }
}

/** Supprime un rayon : ses produits restent au catalogue, sans rayon. */
export async function deleteCategory(db: Db, id: number): Promise<void> {
  await db.delete(categories).where(eq(categories.id, id));
}

export interface DashboardStats {
  pendingOrders: number;
  paidOrders: number;
  revenueCents: number;
  activeProducts: number;
  lowStock: Product[];
  outOfStock: number;
  /** Commandes non honorables pour lesquelles un paiement a été reçu : à rembourser. */
  refundsDue: number;
}

export const LOW_STOCK_THRESHOLD = 5;

export async function getDashboardStats(db: Db): Promise<DashboardStats> {
  const [pending] = await db.select({ total: count() }).from(orders).where(eq(orders.status, "pending"));
  const [paid] = await db
    .select({ total: count(), revenue: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int` })
    .from(orders)
    .where(inArray(orders.status, ["paid", "fulfilled"]));
  const [active] = await db.select({ total: count() }).from(products).where(eq(products.active, true));
  const [out] = await db.select({ total: count() }).from(products).where(and(eq(products.active, true), lte(products.stock, 0)));
  const low = await db
    .select()
    .from(products)
    .where(and(eq(products.active, true), gt(products.stock, 0), lte(products.stock, LOW_STOCK_THRESHOLD)))
    .orderBy(asc(products.stock), asc(products.name))
    .limit(8);
  const [refunds] = await db
    .select({ total: count() })
    .from(orders)
    .where(and(inArray(orders.status, ["expired", "cancelled"]), isNotNull(orders.paymentReference)));

  return {
    pendingOrders: pending.total,
    paidOrders: paid.total,
    revenueCents: paid.revenue,
    activeProducts: active.total,
    lowStock: low,
    outOfStock: out.total,
    refundsDue: refunds.total,
  };
}
