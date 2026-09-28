export interface Seller {
  name: string;
  status: string;
  address: string;
  email: string;
  phone: string;
  companyId: string;
  vatNumber: string;
  mediator: string;
  returnDays: number;
  deliveryDelay: string;
}

const PLACEHOLDER = "[à renseigner dans les variables d'environnement]";

/**
 * Identité du vendeur, lue dans l'environnement plutôt que dans le dépôt : ce
 * sont des données personnelles. `scripts/check-production-env.mjs` bloque un
 * déploiement de production qui les laisserait vides.
 */
export function getSeller(env: Record<string, string | undefined> = process.env): Seller {
  const clean = (name: string) => env[name]?.trim() ?? "";
  const returnDays = Number(clean("SHOP_RETURN_DAYS"));

  return {
    name: clean("SHOP_LEGAL_NAME") || PLACEHOLDER,
    status: clean("SHOP_LEGAL_STATUS") || "Particulier, éditeur non professionnel",
    address: clean("SHOP_LEGAL_ADDRESS"),
    email: clean("SHOP_CONTACT_EMAIL") || PLACEHOLDER,
    phone: clean("SHOP_CONTACT_PHONE"),
    companyId: clean("SHOP_COMPANY_ID"),
    vatNumber: clean("SHOP_VAT_NUMBER"),
    mediator: clean("SHOP_MEDIATOR"),
    returnDays: Number.isInteger(returnDays) && returnDays > 0 ? returnDays : 14,
    deliveryDelay: clean("SHOP_DELIVERY_DELAY") || "Le délai de livraison est communiqué par le vendeur après la confirmation de la commande.",
  };
}
