import { asc, eq, sql } from "drizzle-orm";

import { store } from "@/config/store";
import type { Db } from "@/db/client";
import { currencies } from "@/db/schema";
import type { Currency } from "@/db/schema";
import { RATE_SCALE } from "@/lib/currency";

/**
 * Devises que la boutique connaît par défaut, avec leur nombre de décimales.
 * La devise de base (`SHOP_CURRENCY`) est toujours active ; les deux autres
 * sont créées inactives, sans taux, tant que l'administration ne les active
 * pas explicitement (jamais de taux de change inventé pour de l'argent réel).
 */
const DEFAULT_CURRENCIES: Record<string, number> = { XOF: 0, USD: 2, EUR: 2 };

/**
 * Crée les lignes de devises manquantes. Idempotent : peut être rappelé à
 * chaque migration ou à chaque démarrage sans effet une fois en place. Si la
 * devise de base a changé (`SHOP_CURRENCY` modifiée après coup), la nouvelle
 * devient base et active ; l'ancienne redevient une devise secondaire, sans
 * perdre son taux ni être désactivée automatiquement.
 */
export async function ensureCurrenciesSeeded(db: Db): Promise<void> {
  const baseCode = store.currency.code.toUpperCase();
  const codes = new Set([...Object.keys(DEFAULT_CURRENCIES), baseCode]);

  for (const [position, code] of [...codes].entries()) {
    const exponent = code === baseCode ? store.currency.exponent : (DEFAULT_CURRENCIES[code] ?? 2);
    await db
      .insert(currencies)
      .values({
        code,
        exponent,
        rateMicros: code === baseCode ? RATE_SCALE : 0,
        isBase: code === baseCode,
        active: code === baseCode,
        position,
      })
      .onConflictDoNothing();
  }

  // La devise de base a pu changer depuis le dernier déploiement : une seule ligne porte isBase.
  await db.update(currencies).set({ isBase: false }).where(sql`${currencies.code} <> ${baseCode} and ${currencies.isBase}`);
  await db
    .update(currencies)
    .set({ isBase: true, active: true, rateMicros: RATE_SCALE, exponent: store.currency.exponent })
    .where(eq(currencies.code, baseCode));
}

export async function listActiveCurrencies(db: Db): Promise<Currency[]> {
  return db.select().from(currencies).where(eq(currencies.active, true)).orderBy(asc(currencies.position));
}

export async function listAllCurrencies(db: Db): Promise<Currency[]> {
  return db.select().from(currencies).orderBy(asc(currencies.position));
}

export async function getCurrency(db: Db, code: string): Promise<Currency | undefined> {
  const [row] = await db.select().from(currencies).where(eq(currencies.code, code.toUpperCase())).limit(1);
  return row;
}

export class BaseCurrencyImmutableError extends Error {
  constructor() {
    super("La devise de base se change via SHOP_CURRENCY, pas depuis cette page.");
    this.name = "BaseCurrencyImmutableError";
  }
}

export class MissingRateError extends Error {
  constructor() {
    super("Définissez un taux de change positif avant d'activer cette devise.");
    this.name = "MissingRateError";
  }
}

/** Met à jour le taux et/ou l'activation d'une devise secondaire (jamais la devise de base). */
export async function setCurrencyRate(db: Db, code: string, input: { rateMicros: number; active: boolean }): Promise<void> {
  const current = await getCurrency(db, code);
  if (!current) throw new Error("Devise inconnue.");
  if (current.isBase) throw new BaseCurrencyImmutableError();
  if (input.active && input.rateMicros <= 0) throw new MissingRateError();

  await db
    .update(currencies)
    .set({ rateMicros: input.rateMicros, active: input.active, updatedAt: sql`now()` })
    .where(eq(currencies.code, current.code));
}
