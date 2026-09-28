/**
 * Conversion entre la devise de base du catalogue (celle dans laquelle les
 * prix sont saisis) et une devise acceptée par la boutique.
 *
 * Les taux sont des entiers à l'échelle `RATE_SCALE` (micro-unités) : jamais
 * de nombre flottant stocké, pour les mêmes raisons que les prix eux-mêmes.
 * `rateMicros` s'interprète comme « 1 unité de la devise de base vaut
 * `rateMicros / RATE_SCALE` unités de cette devise ».
 */
export const RATE_SCALE = 1_000_000;

export interface RateTarget {
  exponent: number;
  rateMicros: number;
}

/**
 * Convertit un montant en unité mineure de la devise de base vers l'unité
 * mineure de `target`. La multiplication reste dans l'intervalle des entiers
 * sûrs de JavaScript pour des montants de boutique réalistes (jusqu'à
 * plusieurs millions d'unités) ; ce n'est pas conçu pour des montants
 * arbitrairement grands.
 */
export function convertMinor(minorInBase: number, target: RateTarget, baseExponent: number): number {
  if (target.rateMicros === RATE_SCALE && target.exponent === baseExponent) return minorInBase;
  const scaled = minorInBase * target.rateMicros * 10 ** target.exponent;
  const divisor = 10 ** baseExponent * RATE_SCALE;
  return Math.round(scaled / divisor);
}

/** Lit un taux saisi par une personne (« 0.0016 », « 600 »raccords…) en micro-unités entières. */
export function parseRateInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [, decimals = ""] = cleaned.split(".");
  if (decimals.length > 6) return null;
  const micros = Math.round(Number(cleaned) * RATE_SCALE);
  return micros > 0 ? micros : null;
}

/** Prépare un champ de formulaire : 1600 micros → « 0.0016 ». Sans zéros inutiles. */
export function rateToInput(rateMicros: number): string {
  return (rateMicros / RATE_SCALE).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}
