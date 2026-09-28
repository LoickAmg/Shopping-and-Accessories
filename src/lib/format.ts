import { exponentForCurrency, store } from "@/config/store";
import type { Currency } from "@/db/schema";

import { convertMinor } from "./currency";
import type { RateTarget } from "./currency";
import { formatMoney } from "./money";

/** Un montant déjà exprimé dans la devise de base (SHOP_CURRENCY), sans conversion. */
export function money(minor: number): string {
  return formatMoney(minor, store.currency, store.locale);
}

/**
 * Un montant du catalogue (toujours en devise de base) affiché dans la devise
 * choisie par le visiteur : convertit puis formate. Pour un montant déjà figé
 * sur une commande (déjà dans sa devise), utiliser `orderMoney` à la place.
 */
export function moneyIn(minorBase: number, target: Pick<Currency, "code" | "exponent" | "rateMicros">): string {
  const rate: RateTarget = { exponent: target.exponent, rateMicros: target.rateMicros };
  return formatMoney(convertMinor(minorBase, rate, store.currency.exponent), { code: target.code, exponent: target.exponent }, store.locale);
}

/** Un montant déjà figé dans la devise indiquée (ligne de commande, total de commande) : aucune conversion. */
export function orderMoney(minor: number, currencyCode: string): string {
  return formatMoney(minor, { code: currencyCode, exponent: exponentForCurrency(currencyCode) }, store.locale);
}

export function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat(store.locale, { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

export function formatDay(value: Date | string): string {
  return new Intl.DateTimeFormat(store.locale, { dateStyle: "long" }).format(new Date(value));
}

export const STATUS_LABELS: Record<string, string> = {
  pending: "En attente de paiement",
  paid: "Payée",
  fulfilled: "Expédiée",
  cancelled: "Annulée",
  expired: "Expirée",
  refunded: "Remboursée",
};

export function initialOf(name: string): string {
  const letter = name.trim().match(/\p{L}/u)?.[0] ?? "·";
  return letter.toLocaleUpperCase("fr");
}
