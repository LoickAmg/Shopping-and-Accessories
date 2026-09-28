import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

import type { Db } from "../src/db/client";
import * as schema from "../src/db/schema";
import { seedIfEmpty } from "../src/db/seed";
import { ensureCurrenciesSeeded } from "../src/server/currency";

/**
 * Applique les migrations SQL (dossier drizzle/) à la base pointée par
 * DATABASE_URL, s'assure que les devises (base, USD, EUR) existent, puis, si
 * SEED_DEMO_CATALOG=true, charge le catalogue de démonstration dans une base
 * vide. Sans DATABASE_URL, il n'y a rien à faire : le développement local
 * utilise une base embarquée qui se migre toute seule.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL absente : migrations ignorées (base locale embarquée).");
    return;
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations appliquées.");

    await ensureCurrenciesSeeded(db as unknown as Db);
    console.log("Devises vérifiées (XOF, USD, EUR).");

    if (process.env.SEED_DEMO_CATALOG === "true") {
      await seedIfEmpty(db as unknown as Db);
      console.log("Catalogue de démonstration vérifié (chargé si la base était vide).");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Échec des migrations :", error);
  process.exit(1);
});
