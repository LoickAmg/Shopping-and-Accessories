import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
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
    truncate table payment_events, order_items, orders, cart_items, carts, sessions, users, products, categories, rate_limits, currencies
    restart identity cascade
  `);
  await ensureCurrenciesSeeded(db);
  if (options.seeded) await seedCatalog(db);
}

export { schema };
