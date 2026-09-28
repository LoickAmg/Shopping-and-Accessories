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

function currencyFromEnv(): CurrencyConfig {
  const code = (process.env.SHOP_CURRENCY ?? "XOF").toUpperCase();
  return { code, exponent: exponentForCurrency(code) };
}

/** Convertit un prix exprimé en unité principale (12,5 €) en unité mineure (1250). */
export function toMinorUnits(major: number, exponent: number): number {
  return Math.round(major * 10 ** exponent);
}

const currency = currencyFromEnv();

export const store: StoreConfig = {
  name: process.env.SHOP_NAME?.trim() || "Shopping & Accessories",
  tagline: process.env.SHOP_TAGLINE?.trim() || "Des pièces choisies. Un style qui reste.",
  description:
    process.env.SHOP_DESCRIPTION?.trim() ||
    "Une sélection d’accessoires et d’objets essentiels, présentés comme des pièces de collection.",
  locale: process.env.SHOP_LOCALE ?? "fr-FR",
  currency,
  theme: (process.env.SHOP_THEME as ThemeId | undefined) ?? "papier",
  shipping: {
    flatCents: toMinorUnits(currency.exponent === 0 ? 2000 : 4.9, currency.exponent),
    freeOverCents: toMinorUnits(currency.exponent === 0 ? 30000 : 60, currency.exponent),
    countries: (process.env.SHOP_COUNTRIES ?? "BJ,TG,CI,SN,FR").split(",").map((c) => c.trim()),
  },
  orderReservationMinutes: Number(process.env.ORDER_RESERVATION_MINUTES ?? 30),
  demoNotice: process.env.SHOP_DEMO_NOTICE !== "false",
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
