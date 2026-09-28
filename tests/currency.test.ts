import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import { RATE_SCALE, convertMinor, parseRateInput, rateToInput } from "@/lib/currency";
import {
  BaseCurrencyImmutableError,
  MissingRateError,
  ensureCurrenciesSeeded,
  getCurrency,
  listActiveCurrencies,
  listAllCurrencies,
  setCurrencyRate,
} from "@/server/currency";

import { createTestDb, resetDb } from "./helpers";

describe("convertMinor", () => {
  it("laisse un montant inchangé vers la devise de base elle-même", () => {
    expect(convertMinor(1234, { exponent: 0, rateMicros: RATE_SCALE }, 0)).toBe(1234);
  });

  it("convertit du franc CFA (XOF, 0 décimale) vers le dollar (2 décimales)", () => {
    // 1 XOF = 0.0016 USD (600 XOF pour 1 USD, valeur d'exemple)
    const usd = { exponent: 2, rateMicros: 1600 };
    expect(convertMinor(600, usd, 0)).toBe(96); // 600 XOF -> 0.96 $ -> 96 cents
    expect(convertMinor(60000, usd, 0)).toBe(9600); // 60 000 XOF -> 96,00 $
  });

  it("convertit du dollar vers le franc CFA", () => {
    // 1 USD = 600 XOF
    const xof = { exponent: 0, rateMicros: 600 * RATE_SCALE };
    expect(convertMinor(100, xof, 2)).toBe(600); // 1,00 $ -> 600 XOF
    expect(convertMinor(1050, xof, 2)).toBe(6300); // 10,50 $ -> 6 300 XOF
  });

  it("arrondit au plus proche", () => {
    const target = { exponent: 2, rateMicros: 333_333 }; // ~1/3
    // 100 XOF (exposant 0) * 0,333333 = 33,3333 -> 33,33 dans la devise cible (2 décimales) = 3333 unités mineures
    expect(convertMinor(100, target, 0)).toBe(3333);
  });
});

describe("parseRateInput / rateToInput", () => {
  it("lit un taux décimal, avec virgule ou séparateurs de milliers", () => {
    expect(parseRateInput("0.0016")).toBe(1600);
    expect(parseRateInput("0,0016")).toBe(1600);
    expect(parseRateInput("600")).toBe(600 * RATE_SCALE);
    expect(parseRateInput("1 600")).toBe(1600 * RATE_SCALE);
  });

  it("refuse un taux nul, négatif ou invalide", () => {
    for (const bad of ["0", "-1", "abc", "1.2.3", "1.2345678"]) expect(parseRateInput(bad), bad).toBeNull();
  });

  it("est l'inverse de rateToInput pour une saisie propre", () => {
    expect(rateToInput(1600)).toBe("0.0016");
    expect(rateToInput(600 * RATE_SCALE)).toBe("600");
  });
});

describe("devises en base", () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  it("crée la devise de base active, et USD/EUR inactives sans taux", async () => {
    const all = await listAllCurrencies(db);
    expect(all.map((c) => c.code).sort()).toEqual(["EUR", "USD", "XOF"]);

    const base = all.find((c) => c.isBase);
    expect(base?.code).toBe("XOF");
    expect(base?.active).toBe(true);
    expect(base?.rateMicros).toBe(RATE_SCALE);

    for (const code of ["USD", "EUR"]) {
      const currency = all.find((c) => c.code === code);
      expect(currency?.active, code).toBe(false);
      expect(currency?.rateMicros, code).toBe(0);
    }
  });

  it("est idempotent : rappeler le seed ne duplique ni n'écrase un taux déjà réglé", async () => {
    await setCurrencyRate(db, "USD", { rateMicros: 1600, active: true });
    await ensureCurrenciesSeeded(db);

    const all = await listAllCurrencies(db);
    expect(all).toHaveLength(3);
    expect((await getCurrency(db, "USD"))?.rateMicros).toBe(1600);
    expect((await getCurrency(db, "USD"))?.active).toBe(true);
  });

  it("ne liste que les devises actives pour le public", async () => {
    expect((await listActiveCurrencies(db)).map((c) => c.code)).toEqual(["XOF"]);
    await setCurrencyRate(db, "EUR", { rateMicros: 1500, active: true });
    expect((await listActiveCurrencies(db)).map((c) => c.code)).toEqual(["XOF", "EUR"]);
  });

  it("refuse d'activer une devise sans taux positif", async () => {
    await expect(setCurrencyRate(db, "USD", { rateMicros: 0, active: true })).rejects.toBeInstanceOf(MissingRateError);
    expect((await getCurrency(db, "USD"))?.active).toBe(false);
  });

  it("autorise à régler un taux sans activer, puis à désactiver ensuite", async () => {
    await setCurrencyRate(db, "USD", { rateMicros: 1600, active: false });
    expect((await getCurrency(db, "USD"))?.active).toBe(false);
    expect((await getCurrency(db, "USD"))?.rateMicros).toBe(1600);

    await setCurrencyRate(db, "USD", { rateMicros: 1600, active: true });
    await setCurrencyRate(db, "USD", { rateMicros: 1600, active: false });
    expect((await getCurrency(db, "USD"))?.active).toBe(false);
  });

  it("refuse de modifier la devise de base depuis cette fonction", async () => {
    await expect(setCurrencyRate(db, "XOF", { rateMicros: 2000, active: true })).rejects.toBeInstanceOf(BaseCurrencyImmutableError);
  });

  it("refuse une devise inconnue", async () => {
    await expect(setCurrencyRate(db, "GBP", { rateMicros: 1000, active: true })).rejects.toThrow(/inconnue/);
  });
});
