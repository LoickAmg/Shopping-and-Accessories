import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import type { Db } from "../src/db/client";
import * as schema from "../src/db/schema";
import { seedIfEmpty } from "../src/db/seed";

/** Charge le catalogue de démonstration dans la base de DATABASE_URL, si elle ne contient aucun produit. */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL est requise (en local, la base embarquée se garnit toute seule).");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await seedIfEmpty(drizzle(pool, { schema }) as unknown as Db);
    console.log("Catalogue de démonstration vérifié (chargé si la base était vide).");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Échec du chargement :", error);
  process.exit(1);
});
