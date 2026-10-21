import { and, asc, count, desc, eq, gt, ilike, inArray, isNotNull, lte, or, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { categories, orders, productVariants, products } from "@/db/schema";
import type { CategoryFamily, Condition, Department, Product, ProductVariant, WearGrade } from "@/db/schema";
import { buildSearchText, normalizeForSearch, slugify } from "@/lib/slug";
import { CONDITION_LABELS, DEPARTMENT_LABELS, variantLabel } from "@/lib/taxonomy";

import { escapeLike, productStock } from "./catalog";
import { recordMovement } from "./stock";
import { notifyLowStock } from "./stock-alerts";

export interface VariantInput {
  /** Déclinaison existante à mettre à jour ; absent pour une nouvelle. */
  id?: number;
  size: string;
  color: string;
  sku: string | null;
  stock: number;
  /**
   * Stock affiché à l'ouverture du formulaire. S'il est connu, la correction
   * s'applique en écart (saisi − affiché) : une vente passée entre-temps n'est
   * pas effacée par l'enregistrement.
   */
  originalStock?: number;
}

export interface ProductInput {
  name: string;
  slug?: string;
  summary: string;
  description: string;
  categoryId: number | null;
  priceCents: number;
  compareAtCents: number | null;
  active: boolean;
  department: Department;
  condition: Condition;
  wearGrade: WearGrade | null;
  defects: string;
  material: string;
  tone: string;
  imageUrl: string | null;
  gallery: string[];
  sku: string | null;
  /** Au moins une déclinaison ; une seule, sans taille ni couleur, pour un article unique (sac, collier…). */
  variants: VariantInput[];
}

export class InvalidVariantsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVariantsError";
  }
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

/** Texte de recherche : nom, textes, matière, rayon, univers, état et couleurs des déclinaisons. */
export function searchTextOf(input: Pick<ProductInput, "name" | "summary" | "description" | "material" | "department" | "condition"> & { colors?: string[] }, categoryName: string): string {
  return buildSearchText(
    input.name,
    input.summary,
    input.description,
    input.material,
    categoryName,
    DEPARTMENT_LABELS[input.department],
    CONDITION_LABELS[input.condition],
    ...(input.colors ?? []),
  );
}

async function categoryNameOf(db: Db, categoryId: number | null): Promise<string> {
  if (categoryId == null) return "";
  const [category] = await db.select({ name: categories.name }).from(categories).where(eq(categories.id, categoryId)).limit(1);
  return category?.name ?? "";
}

function checkVariants(variants: VariantInput[]): VariantInput[] {
  const cleaned = variants.map((variant) => ({ ...variant, size: variant.size.trim(), color: variant.color.trim() }));
  if (cleaned.length === 0) throw new InvalidVariantsError("Ajoutez au moins une déclinaison (une ligne sans taille suffit pour un article unique).");
  const keys = new Set<string>();
  for (const variant of cleaned) {
    const key = `${variant.size.toLowerCase()}|${variant.color.toLowerCase()}`;
    if (keys.has(key)) throw new InvalidVariantsError(`Déclinaison en double : ${variantLabel(variant) || "sans taille ni couleur"}.`);
    keys.add(key);
  }
  return cleaned;
}

/** Les champs propres au produit (sans les déclinaisons), nettoyés selon l'état. */
function productColumns(input: ProductInput) {
  const { variants: _variants, ...rest } = input;
  void _variants;
  const secondHand = input.condition === "seconde_main";
  return {
    ...rest,
    // L'état d'usure et les défauts n'ont de sens que pour la seconde main.
    wearGrade: secondHand ? input.wearGrade : null,
    defects: secondHand ? input.defects : "",
  };
}

/** Remplace les déclinaisons d'un produit par celles du formulaire, sans jamais perdre l'historique. */
async function syncVariants(tx: Db, productId: number, variants: VariantInput[], actorId: string | null): Promise<void> {
  const existing = await tx.select().from(productVariants).where(eq(productVariants.productId, productId));
  const kept = new Set<number>();

  for (const [position, variant] of variants.entries()) {
    const match =
      existing.find((row) => variant.id != null && row.id === variant.id) ??
      existing.find((row) => row.size.toLowerCase() === variant.size.toLowerCase() && row.color.toLowerCase() === variant.color.toLowerCase());
    const values = { size: variant.size, color: variant.color, sku: variant.sku, position, active: true };
    if (match && !kept.has(match.id)) {
      kept.add(match.id);
      // Écart voulu par l'équipe, appliqué au stock actuel, jamais en dessous de zéro.
      const delta = variant.originalStock != null && variant.id === match.id ? variant.stock - variant.originalStock : variant.stock - match.stock;
      const [updated] = await tx
        .update(productVariants)
        .set({ ...values, stock: sql`greatest(${productVariants.stock} + ${delta}, 0)` })
        .where(eq(productVariants.id, match.id))
        .returning({ stock: productVariants.stock });
      await recordMovement(tx, { variantId: match.id, delta: updated.stock - match.stock, stockAfter: updated.stock, reason: "ajustement", actorId });
    } else {
      const [created] = await tx
        .insert(productVariants)
        .values({ productId, ...values, stock: variant.stock })
        .returning({ id: productVariants.id });
      kept.add(created.id);
      await recordMovement(tx, { variantId: created.id, delta: variant.stock, stockAfter: variant.stock, reason: "ajustement", actorId });
    }
  }

  // Une déclinaison retirée du formulaire est désactivée, pas supprimée : les commandes passées la référencent.
  const removed = existing.filter((row) => !kept.has(row.id)).map((row) => row.id);
  if (removed.length > 0) await tx.update(productVariants).set({ active: false }).where(inArray(productVariants.id, removed));
}

export async function createProduct(db: Db, input: ProductInput, actorId: string | null = null): Promise<Product> {
  const variants = checkVariants(input.variants);
  const slug = await uniqueProductSlug(db, input.slug || input.name);
  const categoryName = await categoryNameOf(db, input.categoryId);
  const row = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Db;
    const [created] = await tx
      .insert(products)
      .values({ ...productColumns(input), slug, searchText: searchTextOf({ ...input, colors: variants.map((v) => v.color) }, categoryName) })
      .returning();
    await syncVariants(tx, created.id, variants, actorId);
    return created;
  });
  if (variants.some((variant) => variant.originalStock != null && variant.stock < variant.originalStock)) void notifyLowStock(db).catch(() => undefined);
  return row;
}

export async function updateProduct(db: Db, id: number, input: ProductInput, actorId: string | null = null): Promise<Product | undefined> {
  const variants = checkVariants(input.variants);
  const slug = await uniqueProductSlug(db, input.slug || input.name, id);
  const categoryName = await categoryNameOf(db, input.categoryId);
  const row = await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Db;
    const [updated] = await tx
      .update(products)
      .set({
        ...productColumns(input),
        slug,
        searchText: searchTextOf({ ...input, colors: variants.map((v) => v.color) }, categoryName),
        updatedAt: sql`now()`,
      })
      .where(eq(products.id, id))
      .returning();
    if (!updated) return undefined;
    await syncVariants(tx, id, variants, actorId);
    return updated;
  });
  if (row && variants.some((variant) => variant.originalStock != null && variant.stock < variant.originalStock)) void notifyLowStock(db).catch(() => undefined);
  return row;
}

export async function setProductActive(db: Db, id: number, active: boolean): Promise<void> {
  await db.update(products).set({ active, updatedAt: sql`now()` }).where(eq(products.id, id));
}

export const ADMIN_PRODUCTS_PAGE_SIZE = 40;

export interface AdminProductFilter {
  q?: string;
  categoryId?: number | "aucun";
  status?: "en-vente" | "archives";
  /** `rupture` : plus rien à vendre ; `bas` : au moins une taille sous le seuil d'alerte. */
  stock?: "rupture" | "bas";
  page?: number;
}

/** Liste du back-office : recherche (nom, textes, référence), filtres et pagination. */
export async function listProductsForAdmin(db: Db, filter: AdminProductFilter = {}) {
  const conditions = [];
  // Chaque mot doit se retrouver quelque part : « robe lin » trouve « Robe portefeuille, lin bleu ».
  const words = normalizeForSearch((filter.q ?? "").trim()).split(/\s+/).filter(Boolean).slice(0, 6);
  for (const word of words) {
    const pattern = `%${escapeLike(word)}%`;
    conditions.push(
      or(
        ilike(products.searchText, pattern),
        ilike(products.sku, pattern),
        ilike(products.slug, pattern),
        sql`exists (select 1 from ${productVariants} v where v.product_id = ${products.id} and v.sku ilike ${pattern})`,
      ),
    );
  }
  if (filter.categoryId === "aucun") conditions.push(sql`${products.categoryId} is null`);
  else if (filter.categoryId) conditions.push(eq(products.categoryId, filter.categoryId));
  if (filter.status === "en-vente") conditions.push(eq(products.active, true));
  if (filter.status === "archives") conditions.push(eq(products.active, false));
  if (filter.stock === "rupture") conditions.push(sql`${productStock} <= 0`);
  if (filter.stock === "bas") {
    conditions.push(
      sql`exists (select 1 from ${productVariants} v where v.product_id = ${products.id} and v.active and v.stock > 0 and v.stock <= ${LOW_STOCK_THRESHOLD})`,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const page = Math.max(1, filter.page ?? 1);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ product: products, stock: productStock, categoryName: categories.name })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(where)
      .orderBy(desc(products.active), desc(products.updatedAt), asc(products.name))
      .limit(ADMIN_PRODUCTS_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PRODUCTS_PAGE_SIZE),
    db.select({ total: count() }).from(products).where(where),
  ]);
  return { rows, total };
}

/**
 * Copie un produit pour en créer un proche (autre coloris, autre pièce de
 * friperie) : textes, prix, classement, photos et tailles sont repris ; la
 * copie part hors vente, avec un stock à zéro, le temps de la compléter.
 */
export async function duplicateProduct(db: Db, id: number): Promise<Product | undefined> {
  const source = await getProductForAdmin(db, id);
  if (!source) return undefined;
  const name = `${source.name} (copie)`.slice(0, 160);
  const slug = await uniqueProductSlug(db, `${source.slug}-copie`);
  return db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Db;
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, variants, ...columns } = source;
    void _id;
    void _createdAt;
    void _updatedAt;
    const [row] = await tx
      .insert(products)
      .values({ ...columns, name, slug, active: false, sku: null })
      .returning();
    const copies = variants.length > 0 ? variants : [{ size: "", color: "" }];
    await tx
      .insert(productVariants)
      .values(copies.map((variant, position) => ({ productId: row.id, size: variant.size, color: variant.color, sku: null, stock: 0, position })));
    return row;
  });
}

/** Résumé lisible des champs modifiés, pour le journal d'activité. */
export function describeProductChanges(before: AdminProduct, input: ProductInput): string[] {
  const changes: string[] = [];
  const fields: [keyof ProductInput & keyof Product, string][] = [
    ["name", "nom"],
    ["summary", "résumé"],
    ["description", "description"],
    ["categoryId", "rayon"],
    ["priceCents", "prix"],
    ["compareAtCents", "prix barré"],
    ["department", "univers"],
    ["condition", "état"],
    ["material", "matière"],
    ["imageUrl", "photo principale"],
  ];
  for (const [field, label] of fields) {
    if ((before[field] ?? null) !== (input[field] ?? null)) changes.push(label);
  }
  if (before.gallery.join("|") !== input.gallery.join("|")) changes.push("photos");
  if (before.active !== input.active) changes.push(input.active ? "remis en vente" : "retiré de la vente");
  for (const variant of input.variants) {
    const previous = before.variants.find((row) => row.id === variant.id);
    const label = variantLabel(variant) || "stock";
    if (!previous) {
      changes.push(`ajout ${label} (${variant.stock})`);
      continue;
    }
    const shown = variant.originalStock ?? previous.stock;
    if (variant.stock !== shown) changes.push(`${label} ${shown} → ${variant.stock}`);
  }
  for (const row of before.variants) {
    if (!input.variants.some((variant) => variant.id === row.id)) changes.push(`retrait ${variantLabel(row) || "déclinaison"}`);
  }
  return changes;
}

export interface AdminProduct extends Product {
  variants: ProductVariant[];
}

/** Produit et ses déclinaisons actives, pour le formulaire d'édition. */
export async function getProductForAdmin(db: Db, id: number): Promise<AdminProduct | undefined> {
  const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!row) return undefined;
  const variants = await db
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.productId, id), eq(productVariants.active, true)))
    .orderBy(asc(productVariants.position), asc(productVariants.id));
  return { ...row, variants };
}

export interface CategoryInput {
  name: string;
  description: string;
  family: CategoryFamily;
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
    const colors = (await db.select({ color: productVariants.color }).from(productVariants).where(eq(productVariants.productId, product.id))).map((v) => v.color);
    await db.update(products).set({ searchText: searchTextOf({ ...product, colors }, input.name) }).where(eq(products.id, product.id));
  }
}

/** Supprime un rayon : ses produits restent au catalogue, sans rayon. */
export async function deleteCategory(db: Db, id: number): Promise<void> {
  await db.delete(categories).where(eq(categories.id, id));
}

export interface LowStockLine {
  productId: number;
  name: string;
  /** « Taille M · Noir », vide pour un article sans déclinaison. */
  label: string;
  stock: number;
}

export interface DashboardStats {
  pendingOrders: number;
  paidOrders: number;
  revenueCents: number;
  activeProducts: number;
  /** Déclinaisons presque épuisées (stock bas par taille). */
  lowStock: LowStockLine[];
  /** Produits actifs dont toutes les déclinaisons sont épuisées. */
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
  const [out] = await db.select({ total: count() }).from(products).where(and(eq(products.active, true), sql`${productStock} <= 0`));
  const low = await db
    .select({ productId: products.id, name: products.name, size: productVariants.size, color: productVariants.color, stock: productVariants.stock })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(products.active, true), eq(productVariants.active, true), gt(productVariants.stock, 0), lte(productVariants.stock, LOW_STOCK_THRESHOLD)))
    .orderBy(asc(productVariants.stock), asc(products.name))
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
    lowStock: low.map((row) => ({ productId: row.productId, name: row.name, label: variantLabel(row), stock: row.stock })),
    outOfStock: out.total,
    refundsDue: refunds.total,
  };
}
