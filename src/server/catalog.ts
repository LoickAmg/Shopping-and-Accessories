import { and, asc, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { categories, productVariants, products } from "@/db/schema";
import type { Category, CategoryFamily, Condition, Department, Product, ProductVariant } from "@/db/schema";
import { normalizeForSearch } from "@/lib/slug";

export const SORTS = ["recent", "price-asc", "price-desc", "name"] as const;
export type Sort = (typeof SORTS)[number];

export interface ProductFilter {
  category?: string;
  /** Une famille, ou plusieurs (« Accessoires » regroupe accessoires et bijoux). */
  family?: CategoryFamily | CategoryFamily[];
  department?: Department;
  condition?: Condition;
  /** Taille disponible (au moins une pièce en stock dans cette taille). */
  size?: string;
  q?: string;
  sort?: Sort;
  inStockOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductListItem extends Product {
  /** Stock total des déclinaisons actives. */
  stock: number;
  /** Nombre de déclinaisons actives. */
  variantCount: number;
  /**
   * Déclinaison à ajouter directement au panier quand le produit n'en a qu'une
   * (sac, collier, pièce de friperie) ; null s'il faut choisir une taille.
   */
  singleVariantId: number | null;
  categoryName: string | null;
  categorySlug: string | null;
  categoryFamily: CategoryFamily | null;
}

export interface ProductDetail extends ProductListItem {
  /** Déclinaisons actives, dans l'ordre d'affichage. */
  variants: ProductVariant[];
}

export interface ProductPage {
  items: ProductListItem[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export const DEFAULT_PAGE_SIZE = 12;

/** Stock d'un produit : la somme de ses déclinaisons actives. */
export const productStock = sql<number>`(
  select coalesce(sum(${productVariants.stock}), 0)::int from ${productVariants}
  where ${productVariants.productId} = ${products.id} and ${productVariants.active}
)`;

const ORDERINGS = {
  recent: [desc(products.createdAt), desc(products.id)],
  "price-asc": [asc(products.priceCents), asc(products.id)],
  "price-desc": [desc(products.priceCents), asc(products.id)],
  name: [asc(products.name), asc(products.id)],
} as const;

/** Nombre de déclinaisons actives d'un produit. */
const variantCountSql = sql<number>`(
  select count(*)::int from ${productVariants}
  where ${productVariants.productId} = ${products.id} and ${productVariants.active}
)`;

/** Identifiant de l'unique déclinaison active, ou null s'il y en a plusieurs. */
const singleVariantSql = sql<number | null>`(
  select case when count(*) = 1 then min(${productVariants.id}) end from ${productVariants}
  where ${productVariants.productId} = ${products.id} and ${productVariants.active}
)`;

const listColumns = {
  product: products,
  stock: productStock,
  variantCount: variantCountSql,
  singleVariantId: singleVariantSql,
  categoryName: categories.name,
  categorySlug: categories.slug,
  categoryFamily: categories.family,
};

type ListRow = { product: Product; stock: number; variantCount: number; singleVariantId: number | null; categoryName: string | null; categorySlug: string | null; categoryFamily: CategoryFamily | null };

function toItem(row: ListRow): ProductListItem {
  return {
    ...row.product,
    stock: Number(row.stock),
    variantCount: Number(row.variantCount),
    singleVariantId: row.singleVariantId == null ? null : Number(row.singleVariantId),
    categoryName: row.categoryName, categorySlug: row.categorySlug, categoryFamily: row.categoryFamily };
}

/** Échappe les jokers de LIKE pour qu'une recherche « 100% » cherche bien « 100% ». */
export function escapeLike(value: string): string {
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
  if (filter.family) {
    const families = Array.isArray(filter.family) ? filter.family : [filter.family];
    if (families.length > 0) conditions.push(inArray(categories.family, families));
  }
  if (filter.department) conditions.push(eq(products.department, filter.department));
  if (filter.condition) conditions.push(eq(products.condition, filter.condition));
  if (filter.inStockOnly) conditions.push(sql`${productStock} > 0`);
  if (filter.size) {
    conditions.push(sql`exists (
      select 1 from ${productVariants}
      where ${productVariants.productId} = ${products.id} and ${productVariants.active}
        and ${productVariants.stock} > 0 and ${productVariants.size} = ${filter.size}
    )`);
  }
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
    .select(listColumns)
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(...ORDERINGS[filter.sort ?? "recent"])
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { items: rows.map(toItem), total, page, pageCount, pageSize };
}

export async function listVariants(db: Db, productId: number, options: { includeInactive?: boolean } = {}): Promise<ProductVariant[]> {
  const where = options.includeInactive
    ? eq(productVariants.productId, productId)
    : and(eq(productVariants.productId, productId), eq(productVariants.active, true));
  return db.select().from(productVariants).where(where).orderBy(asc(productVariants.position), asc(productVariants.id));
}

export async function getProductBySlug(db: Db, slug: string): Promise<ProductDetail | undefined> {
  const [row] = await db
    .select(listColumns)
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.slug, slug), eq(products.active, true)))
    .limit(1);
  if (!row) return undefined;
  return { ...toItem(row), variants: await listVariants(db, row.product.id) };
}

/** Produits de la même catégorie et du même univers en priorité, hors celui affiché. */
export async function listRelated(db: Db, product: Product, limit = 4): Promise<ProductListItem[]> {
  if (product.categoryId == null) return [];
  const rows = await db
    .select(listColumns)
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.active, true), eq(products.categoryId, product.categoryId), sql`${products.id} <> ${product.id}`))
    .orderBy(sql`${products.department} = ${product.department} desc`, desc(productStock), asc(products.name))
    .limit(limit);
  return rows.map(toItem);
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

/** Tailles proposées en boutique (déclinaisons actives en stock), pour le filtre. */
export async function listAvailableSizes(db: Db): Promise<string[]> {
  const rows = await db
    .selectDistinct({ size: productVariants.size })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(products.active, true), eq(productVariants.active, true), sql`${productVariants.stock} > 0`, sql`${productVariants.size} <> ''`));
  return sortSizes(rows.map((row) => row.size));
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];

/** Tailles dans un ordre naturel : lettres (XS → XXL), puis nombres croissants, puis le reste. */
export function sortSizes(sizes: string[]): string[] {
  const rank = (size: string): [number, number, string] => {
    const letter = SIZE_ORDER.indexOf(size.toUpperCase());
    if (letter >= 0) return [0, letter, size];
    const number = Number.parseFloat(size.replace(",", "."));
    if (Number.isFinite(number)) return [1, number, size];
    return [2, 0, size];
  };
  return [...sizes].sort((a, b) => {
    const [ga, va, sa] = rank(a);
    const [gb, vb, sb] = rank(b);
    return ga - gb || va - vb || sa.localeCompare(sb, "fr");
  });
}
