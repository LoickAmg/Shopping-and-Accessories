import type { ThemeId } from "./themes";

export interface CurrencyConfig {
  /** Code ISO 4217 (EUR, XOF, USD…). */
  code: string;
  /** Nombre de décimales de l'unité mineure : 2 pour l'euro, 0 pour le franc CFA. */
  exponent: number;
}

export interface StoreConfig {
  name: string;
  tagline: string;
  description: string;
  locale: string;
  currency: CurrencyConfig;
  theme: ThemeId;
  shipping: {
    /** Frais de port forfaitaires, en unité mineure. */
    flatCents: number;
    /** Livraison offerte au-delà de ce sous-total ; 0 désactive l'offre. */
    freeOverCents: number;
    countries: readonly string[];
  };
  /** Une commande impayée est annulée (stock restitué) après ce délai. */
  orderReservationMinutes: number;
  /** Bandeau « boutique de démonstration » : à couper quand la vente est réelle. */
  demoNotice: boolean;
}

export const CURRENCY_EXPONENTS: Record<string, number> = { XOF: 0, XAF: 0, GNF: 0, JPY: 0, EUR: 2, USD: 2, GBP: 2, CAD: 2 };

/** Nombre de décimales d'une devise, même une qui n'a jamais été activée dans la boutique (2 par défaut). */
export function exponentForCurrency(code: string): number {
  return CURRENCY_EXPONENTS[code.toUpperCase()] ?? 2;
}

/**
 * Valeur d'une variable d'environnement, nettoyée. Une variable vide ou faite
 * d'espaces compte comme absente : un hébergeur qui importe `.env.example`
 * crée des variables vides, qui doivent retomber sur la valeur par défaut.
 */
function envValue(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

/** Vrai si le moteur Intl accepte ce code de devise (ISO 4217). */
function isValidCurrency(code: string): boolean {
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

/** Locale reconnue par Intl, sinon le français. */
function localeFromEnv(): string {
  const value = envValue("SHOP_LOCALE");
  if (!value) return "fr-FR";
  try {
    return Intl.getCanonicalLocales(value)[0] ?? "fr-FR";
  } catch {
    console.warn(`SHOP_LOCALE « ${value} » invalide : fr-FR utilisée.`);
    return "fr-FR";
  }
}

function currencyFromEnv(): CurrencyConfig {
  let code = (envValue("SHOP_CURRENCY") ?? "XOF").toUpperCase();
  if (!isValidCurrency(code)) {
    console.warn(`SHOP_CURRENCY « ${code} » invalide : XOF utilisée.`);
    code = "XOF";
  }
  return { code, exponent: exponentForCurrency(code) };
}

/** Convertit un prix exprimé en unité principale (12,5 €) en unité mineure (1250). */
export function toMinorUnits(major: number, exponent: number): number {
  return Math.round(major * 10 ** exponent);
}

/** Durée en minutes ; une valeur absente, nulle ou invalide retombe sur la valeur par défaut. */
function positiveMinutes(value: string | undefined, fallback: number): number {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : fallback;
}

const currency = currencyFromEnv();

export const store: StoreConfig = {
  name: envValue("SHOP_NAME") ?? "Shopping & Accessories",
  tagline: envValue("SHOP_TAGLINE") ?? "Des pièces choisies. Un style qui reste.",
  description:
    envValue("SHOP_DESCRIPTION") ??
    "Une sélection d’accessoires et d’objets essentiels, présentés comme des pièces de collection.",
  locale: localeFromEnv(),
  currency,
  theme: (envValue("SHOP_THEME") as ThemeId | undefined) ?? "papier",
  shipping: {
    flatCents: toMinorUnits(currency.exponent === 0 ? 2000 : 4.9, currency.exponent),
    freeOverCents: toMinorUnits(currency.exponent === 0 ? 30000 : 60, currency.exponent),
    countries: (envValue("SHOP_COUNTRIES") ?? "BJ,TG,CI,SN,FR")
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  },
  orderReservationMinutes: positiveMinutes(envValue("ORDER_RESERVATION_MINUTES"), 30),
  demoNotice: envValue("SHOP_DEMO_NOTICE") !== "false",
};

export const COUNTRY_NAMES: Record<string, string> = {
  BJ: "Bénin",
  TG: "Togo",
  CI: "Côte d'Ivoire",
  SN: "Sénégal",
  FR: "France",
  BE: "Belgique",
  CH: "Suisse",
  CA: "Canada",
};
