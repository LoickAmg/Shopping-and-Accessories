import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import type { PgDatabase } from "drizzle-orm/pg-core";

import * as schema from "./schema";

/**
 * Base de données commune à Neon (production) et PGlite (développement local
 * et tests) : les deux parlent le même dialecte Postgres, donc les mêmes
 * requêtes et les mêmes transactions.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

declare global {
  var __etalDb: Promise<Db> | undefined;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const pool = new Pool({ connectionString: url, max: 5 });
    return drizzleNeon(pool, { schema });
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL est requise en production.");
  }

  // Sans DATABASE_URL en développement : Postgres embarqué (WebAssembly), persisté
  // dans .pglite/ pour survivre aux rechargements, migré et garni au premier accès.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(process.env.PGLITE_DIR ?? ".pglite");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const { ensureCurrenciesSeeded } = await import("@/server/currency");
  await ensureCurrenciesSeeded(db as unknown as Db);
  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(db as unknown as Db);
  return db as unknown as Db;
}

/** Connexion partagée par le processus (et conservée entre les rechargements à chaud en développement). */
export function getDb(): Promise<Db> {
  globalThis.__etalDb ??= connect();
  return globalThis.__etalDb;
}
