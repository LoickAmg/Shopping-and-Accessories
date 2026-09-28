import { COUNTRY_NAMES, store } from "@/config/store";
import { getSeller } from "@/config/legal";
import type { Seller } from "@/config/legal";

import { money } from "./format";

export const LEGAL_UPDATED = "En vigueur au 21 septembre 2026";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  description: string;
  updated: string;
  sections: LegalSection[];
}

function identityLine(seller: Seller): string {
  const parts = [seller.name, seller.status];
  if (seller.address) parts.push(seller.address);
  return parts.join(", ");
}

function contactLine(seller: Seller): string {
  return [seller.email, seller.phone].filter(Boolean).join(" · ");
}

function demoSection(): LegalSection[] {
  return store.demoNotice
    ? [
        {
          heading: "Boutique de démonstration",
          paragraphs: [
            `${store.name} fonctionne actuellement en mode démonstration : les paiements sont simulés, aucun montant n'est prélevé et aucune commande n'est expédiée. Les produits, prix et stocks affichés sont fictifs.`,
          ],
        },
      ]
    : [];
}

export function aboutPage(): LegalDocument {
  return {
    title: "À propos",
    description: `Ce que ${store.name} est, et comment la boutique fonctionne.`,
    updated: "",
    sections: [
      ...demoSection(),
      {
        heading: "La boutique",
        paragraphs: [store.description, "Le catalogue, les stocks, les prix et les commandes se gèrent depuis une interface d'administration. Le stock est réservé pendant le paiement, ce qui empêche de vendre deux fois la dernière pièce."],
      },
      {
        heading: "Paiement",
        paragraphs: ["Le paiement passe par un prestataire spécialisé : la boutique ne voit et ne conserve jamais de numéro de carte ni de code de paiement mobile."],
      },
    ],
  };
}

export function legalNotice(): LegalDocument {
  const seller = getSeller();
  const sections: LegalSection[] = [
    {
      heading: "Éditeur du site et vendeur",
      paragraphs: [
        `${store.name} est édité par ${identityLine(seller)}.`,
        `Contact : ${contactLine(seller)}.`,
        ...(seller.companyId ? [`Immatriculation : ${seller.companyId}.`] : []),
        ...(seller.vatNumber ? [`Numéro de TVA : ${seller.vatNumber}.`] : []),
        `Directeur de la publication : ${seller.name}.`,
      ],
    },
    {
      heading: "Hébergement",
      paragraphs: [
        "Le site est hébergé par Vercel Inc., États-Unis (vercel.com). Les données de la boutique (catalogue, comptes, commandes) sont stockées chez Neon, Inc. (neon.tech), dans la région choisie à la création de la base.",
      ],
    },
    {
      heading: "Propriété intellectuelle",
      paragraphs: [
        "Les textes, visuels et le code de la boutique appartiennent à leur auteur ou sont utilisés avec autorisation. Toute reproduction sans accord préalable est interdite.",
      ],
    },
  ];
  if (seller.address === "") {
    sections[0].paragraphs.push("Éditeur non professionnel : l'adresse postale n'est pas publiée et est communiquée à l'hébergeur (loi n° 2004-575 du 21 juin 2004, art. 6, III, 2°).");
  }
  return { title: "Mentions légales", description: `Éditeur, hébergeur et informations légales de ${store.name}.`, updated: LEGAL_UPDATED, sections };
}

export function termsOfSale(): LegalDocument {
  const seller = getSeller();
  const shipping = store.shipping;
  const countries = shipping.countries.map((code) => COUNTRY_NAMES[code] ?? code).join(", ");

  return {
    title: "Conditions générales de vente",
    description: `Conditions de vente de ${store.name} : commande, prix, paiement, livraison, retours.`,
    updated: LEGAL_UPDATED,
    sections: [
      ...demoSection(),
      {
        heading: "1. Vendeur",
        paragraphs: [`Les produits sont vendus par ${identityLine(seller)}. Contact : ${contactLine(seller)}.`],
      },
      {
        heading: "2. Produits et prix",
        paragraphs: [
          `Les produits sont décrits avec le plus grand soin. Les prix sont indiqués en ${store.currency.code}, tels qu'affichés au moment de la commande ; ils peuvent changer, mais le prix appliqué à une commande est celui affiché quand elle est validée.${seller.vatNumber ? " Les prix incluent la TVA applicable." : " Le régime de TVA du vendeur est précisé dans les mentions légales."}`,
          "Les produits sont proposés dans la limite des stocks disponibles. Un produit épuisé ne peut pas être commandé.",
        ],
      },
      {
        heading: "3. Commande",
        paragraphs: [
          `Vous choisissez vos produits, renseignez vos coordonnées et votre adresse, acceptez les présentes conditions puis payez. Le stock est réservé pendant ${store.orderReservationMinutes} minutes à compter de la validation ; sans paiement dans ce délai, la commande est annulée et le stock remis en vente.`,
          "La commande est confirmée dès réception du paiement. Un e-mail de confirmation vous est envoyé ; la commande reste consultable avec le lien de suivi qu'il contient.",
        ],
      },
      {
        heading: "4. Paiement",
        paragraphs: [
          "Le paiement est traité par un prestataire externe. La boutique ne reçoit ni ne conserve vos données de carte ou de paiement mobile. La commande n'est traitée qu'après confirmation du paiement par le prestataire.",
        ],
      },
      {
        heading: "5. Livraison",
        paragraphs: [
          `Livraison vers : ${countries}. Frais de port : ${money(shipping.flatCents)}${shipping.freeOverCents > 0 ? `, offerts à partir de ${money(shipping.freeOverCents)} d'achats` : ""}.`,
          seller.deliveryDelay,
        ],
      },
      {
        heading: "6. Rétractation et retours",
        paragraphs: [
          `Si vous êtes consommateur dans un pays qui reconnaît ce droit (c'est le cas dans l'Union européenne), vous disposez de ${seller.returnDays} jours à compter de la réception pour vous rétracter sans donner de motif, en écrivant à ${seller.email}. Les frais de retour sont à votre charge, sauf indication contraire du vendeur. Le remboursement intervient au plus tard 14 jours après la réception du retour.`,
          "Les produits personnalisés, périssables ou descellés pour des raisons d'hygiène ne peuvent pas être retournés.",
        ],
      },
      {
        heading: "7. Garanties",
        paragraphs: [
          "Les produits bénéficient des garanties légales applicables dans votre pays de résidence (par exemple, dans l'Union européenne, la garantie légale de conformité et la garantie contre les vices cachés). Pour toute réclamation, écrivez à l'adresse de contact.",
        ],
      },
      ...(seller.mediator
        ? [{ heading: "8. Médiation", paragraphs: [`En cas de litige non résolu, vous pouvez recourir gratuitement au médiateur suivant : ${seller.mediator}.`] }]
        : []),
    ],
  };
}

export function privacyPolicy(): LegalDocument {
  const seller = getSeller();
  return {
    title: "Confidentialité et cookies",
    description: `Données personnelles collectées par ${store.name} et cookies utilisés.`,
    updated: LEGAL_UPDATED,
    sections: [
      {
        heading: "Responsable du traitement",
        paragraphs: [`${identityLine(seller)}. Contact : ${contactLine(seller)}.`],
      },
      {
        heading: "Données traitées et finalités",
        paragraphs: [
          "Commande : nom, adresse e-mail, adresse de livraison, téléphone (facultatif) et contenu de la commande, pour la traiter, la livrer et en assurer le suivi. Base : exécution du contrat.",
          "Compte (facultatif) : nom, adresse e-mail et mot de passe, stocké uniquement sous forme d'empreinte irréversible, pour retrouver vos commandes. Base : exécution du contrat.",
          "Sécurité : un compteur de tentatives (connexion, commande) est associé à une empreinte anonyme de votre connexion, jamais à votre adresse IP en clair. Il se vide automatiquement. Base : intérêt légitime (protection contre les abus).",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "La boutique n'utilise que deux cookies strictement nécessaires à son fonctionnement : l'un mémorise votre panier, l'autre votre connexion si vous en ouvrez une. Aucun cookie publicitaire ni de mesure d'audience n'est déposé : aucun bandeau de consentement n'est donc requis.",
        ],
      },
      {
        heading: "Destinataires",
        paragraphs: [
          "Vos données sont traitées par l'hébergeur du site (Vercel), l'hébergeur de la base de données (Neon), le prestataire de paiement choisi au moment de payer, et, si l'envoi d'e-mails est activé, le service d'envoi (Resend). Ces prestataires peuvent traiter des données hors de l'Union européenne.",
        ],
      },
      {
        heading: "Durée de conservation",
        paragraphs: [
          "Les commandes sont conservées pendant la durée exigée par les obligations comptables et légales applicables au vendeur. Un compte est conservé jusqu'à sa suppression sur demande.",
        ],
      },
      {
        heading: "Vos droits",
        paragraphs: [
          `Vous pouvez demander l'accès, la rectification, l'effacement ou la limitation de vos données, ou vous opposer à leur traitement, en écrivant à ${seller.email}. Vous pouvez aussi saisir l'autorité de protection des données de votre pays (en France, la CNIL : cnil.fr).`,
        ],
      },
    ],
  };
}

export function shippingAndReturns(): LegalDocument {
  const seller = getSeller();
  const shipping = store.shipping;
  return {
    title: "Livraison et retours",
    description: "Zones livrées, frais de port, délais, retours et remboursements.",
    updated: LEGAL_UPDATED,
    sections: [
      ...demoSection(),
      {
        heading: "Où livrons-nous ?",
        paragraphs: [shipping.countries.map((code) => COUNTRY_NAMES[code] ?? code).join(", ") + "."],
      },
      {
        heading: "Frais de port",
        paragraphs: [
          `Forfait de ${money(shipping.flatCents)} par commande${shipping.freeOverCents > 0 ? `, offert dès ${money(shipping.freeOverCents)} d'achats` : ""}.`,
        ],
      },
      { heading: "Délais", paragraphs: [seller.deliveryDelay] },
      {
        heading: "Retours",
        paragraphs: [
          `Vous avez ${seller.returnDays} jours à compter de la réception pour vous rétracter (consommateurs des pays qui reconnaissent ce droit). Écrivez à ${seller.email} en indiquant votre numéro de commande ; nous vous indiquons ensuite l'adresse de retour.`,
        ],
      },
    ],
  };
}

export function contactPage(): LegalDocument {
  const seller = getSeller();
  return {
    title: "Contact",
    description: `Contacter ${store.name} : commande, livraison, retour, données personnelles.`,
    updated: "",
    sections: [
      {
        heading: "Nous écrire",
        paragraphs: [`${contactLine(seller)}.`],
      },
      {
        heading: "Pour une réponse rapide",
        paragraphs: ["Indiquez votre numéro de commande (il figure dans l'e-mail de confirmation et sur la page de suivi) et l'adresse e-mail utilisée pour commander."],
      },
    ],
  };
}
