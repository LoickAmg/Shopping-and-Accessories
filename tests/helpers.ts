import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { seedCatalog } from "@/db/seed";
import { ensureCurrenciesSeeded } from "@/server/currency";

/** Postgres réel en mémoire (WebAssembly), migré comme en production. */
export async function createTestDb(options: { seeded?: boolean } = {}): Promise<Db> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const typed = db as unknown as Db;
  await ensureCurrenciesSeeded(typed);
  if (options.seeded) await seedCatalog(typed);
  return typed;
}

/**
 * Remet la base dans l'état d'un catalogue neuf sans la recréer : bien plus
 * rapide que de relancer PGlite avant chaque test.
 */
export async function resetDb(db: Db, options: { seeded?: boolean } = {}): Promise<void> {
  await db.execute(sql`
    truncate table payment_events, order_items, orders, cart_items, carts, sessions, users, product_variants, products, categories, rate_limits, currencies
    restart identity cascade
  `);
  await ensureCurrenciesSeeded(db);
  if (options.seeded) await seedCatalog(db);
}

/**
 * Déclinaison d'un produit du catalogue de démonstration. Les sacs n'en ont
 * qu'une (sans taille) : c'est elle qui porte le stock et que le panier référence.
 */
export async function variantOf(db: Db, slug: string): Promise<schema.ProductVariant> {
  const [row] = await db
    .select({ variant: schema.productVariants })
    .from(schema.productVariants)
    .innerJoin(schema.products, eq(schema.productVariants.productId, schema.products.id))
    .where(eq(schema.products.slug, slug))
    .limit(1);
  if (!row) throw new Error(`Aucune déclinaison pour « ${slug} ».`);
  return row.variant;
}

export async function stockOf(db: Db, slug: string): Promise<number> {
  return (await variantOf(db, slug)).stock;
}

export async function setStock(db: Db, slug: string, stock: number): Promise<void> {
  const variant = await variantOf(db, slug);
  await db.update(schema.productVariants).set({ stock }).where(eq(schema.productVariants.id, variant.id));
}

export { schema };
