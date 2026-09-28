export interface ShippingRules {
  flatCents: number;
  /** Livraison offerte à partir de ce sous-total ; 0 désactive l'offre. */
  freeOverCents: number;
}

export interface Totals {
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  /** Ce qu'il manque pour la livraison offerte, ou null si l'offre n'existe pas ou est atteinte. */
  freeShippingRemainingCents: number | null;
}

/** Frais de port : forfait, offert au-delà d'un seuil, nul pour un panier vide. */
export function computeShipping(subtotalCents: number, rules: ShippingRules): number {
  if (subtotalCents <= 0) return 0;
  if (rules.freeOverCents > 0 && subtotalCents >= rules.freeOverCents) return 0;
  return rules.flatCents;
}

export function computeTotals(subtotalCents: number, rules: ShippingRules): Totals {
  const shippingCents = computeShipping(subtotalCents, rules);
  const remaining =
    rules.freeOverCents > 0 && subtotalCents > 0 && subtotalCents < rules.freeOverCents
      ? rules.freeOverCents - subtotalCents
      : null;
  return {
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    freeShippingRemainingCents: remaining,
  };
}
