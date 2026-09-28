import { and, asc, count, desc, eq, ilike, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { categories, products } from "@/db/schema";
import type { Category, Product } from "@/db/schema";
import { normalizeForSearch } from "@/lib/slug";

export const SORTS = ["recent", "price-asc", "price-desc", "name"] as const;
export type Sort = (typeof SORTS)[number];

export interface ProductFilter {
  category?: string;
  q?: string;
  sort?: Sort;
  inStockOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductListItem extends Product {
  categoryName: string | null;
  categorySlug: string | null;
}

export interface ProductPage {
  items: ProductListItem[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 12;

const ORDERINGS = {
  recent: [desc(products.createdAt), desc(products.id)],
  "price-asc": [asc(products.priceCents), asc(products.id)],
  "price-desc": [desc(products.priceCents), asc(products.id)],
  name: [asc(products.name), asc(products.id)],
} as const;

/** Échappe les jokers de LIKE pour qu'une recherche « 100% » cherche bien « 100% ». */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listCategories(db: Db): Promise<Category[]> {
  return db.select().from(categories).orderBy(asc(categories.position), asc(categories.name));
}

export async function getCategoryBySlug(db: Db, slug: string): Promise<Category | undefined> {
  const [row] = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
  return row;
}

export async function listProducts(db: Db, filter: ProductFilter = {}): Promise<ProductPage> {
  const pageSize = Math.min(Math.max(filter.pageSize ?? DEFAULT_PAGE_SIZE, 1), 60);
  const requestedPage = Math.max(Math.floor(filter.page ?? 1), 1);

  const conditions = [eq(products.active, true)];
  if (filter.category) conditions.push(eq(categories.slug, filter.category));
  if (filter.inStockOnly) conditions.push(sql`${products.stock} > 0`);
  const needle = normalizeForSearch((filter.q ?? "").trim());
  if (needle) conditions.push(ilike(products.searchText, `%${escapeLike(needle)}%`));
  const where = and(...conditions);

  const [{ total }] = await db
    .select({ total: count() })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(where);

  const pageCount = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(requestedPage, pageCount);

  const rows = await db
    .select({
      product: products,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(...ORDERINGS[filter.sort ?? "recent"])
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    items: rows.map((row) => ({ ...row.product, categoryName: row.categoryName, categorySlug: row.categorySlug })),
    total,
    page,
    pageCount,
    pageSize,
  };
}

export async function getProductBySlug(db: Db, slug: string): Promise<ProductListItem | undefined> {
  const [row] = await db
    .select({ product: products, categoryName: categories.name, categorySlug: categories.slug })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.slug, slug), eq(products.active, true)))
    .limit(1);
  return row ? { ...row.product, categoryName: row.categoryName, categorySlug: row.categorySlug } : undefined;
}

/** Produits de la même catégorie, hors celui affiché. */
export async function listRelated(db: Db, product: Product, limit = 4): Promise<ProductListItem[]> {
  if (product.categoryId == null) return [];
  const rows = await db
    .select({ product: products, categoryName: categories.name, categorySlug: categories.slug })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.active, true), eq(products.categoryId, product.categoryId), sql`${products.id} <> ${product.id}`))
    .orderBy(desc(products.stock), asc(products.name))
    .limit(limit);
  return rows.map((row) => ({ ...row.product, categoryName: row.categoryName, categorySlug: row.categorySlug }));
}

/** Nombre de produits actifs par catégorie, pour le rail de navigation. */
export async function countByCategory(db: Db): Promise<Map<number, number>> {
  const rows = await db
    .select({ categoryId: products.categoryId, total: count() })
    .from(products)
    .where(eq(products.active, true))
    .groupBy(products.categoryId);
  return new Map(rows.filter((row) => row.categoryId != null).map((row) => [row.categoryId as number, row.total]));
}
