import type { CurrencyConfig } from "@/config/store";

/** Formate un montant en unité mineure (centimes, francs…) pour l'affichage. */
export function formatMoney(minor: number, currency: CurrencyConfig, locale = "fr-FR"): string {
  const major = minor / 10 ** currency.exponent;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.code,
    minimumFractionDigits: currency.exponent,
    maximumFractionDigits: currency.exponent,
  }).format(major);
}

/** Lit un prix saisi par une personne (« 12,50 », « 12 500 ») et le convertit en unité mineure. */
export function parseMoneyInput(raw: string, exponent: number): number | null {
  const cleaned = raw.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [, decimals = ""] = cleaned.split(".");
  if (decimals.length > exponent) return null;
  return Math.round(Number(cleaned) * 10 ** exponent);
}

/** Pour un champ de formulaire : 1250 → « 12.50 », 12500 (XOF) → « 12500 ». */
export function minorToInput(minor: number, exponent: number): string {
  return (minor / 10 ** exponent).toFixed(exponent);
}
