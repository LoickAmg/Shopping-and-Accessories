export interface PayableOrder {
  id: string;
  number: number;
  email: string;
  customerName: string;
  totalCents: number;
  shippingCents: number;
  currency: string;
  /** Jeton d'accès de la commande (page de suivi et page de paiement de démonstration). */
  accessToken: string;
  items: { name: string; unitPriceCents: number; quantity: number }[];
}

export interface PaymentUrls {
  returnUrl: string;
  cancelUrl: string;
  webhookUrl: string;
}

export interface CreatedPayment {
  /** Adresse vers laquelle envoyer le client pour payer. */
  redirectUrl: string;
  /** Identifiant de la transaction chez le fournisseur. */
  reference: string;
}

export type PaymentStatus = "paid" | "failed" | "pending" | "refunded";

/** Ce qu'un fournisseur nous apprend, dans un format commun à tous. */
export interface PaymentNotification {
  /** Identifiant unique de l'événement chez le fournisseur (sert à l'idempotence). */
  eventId: string;
  orderId: string;
  reference: string;
  status: PaymentStatus;
  /** Montant réellement encaissé, en unité mineure. Comparé au total de la commande avant de valider. */
  amountMinor: number;
  currency: string;
}

export class InvalidSignatureError extends Error {
  constructor(message = "Signature de webhook invalide.") {
    super(message);
    this.name = "InvalidSignatureError";
  }
}

export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentProviderError";
  }
}

/**
 * Un agrégateur de paiement (Stripe, FedaPay, KKiaPay, mobile money…) se
 * branche en implémentant ces deux méthodes. Le reste de la boutique ne
 * connaît que cette interface.
 */
export interface PaymentProvider {
  id: string;
  label: string;
  /** Devises acceptées ; vide = toutes. */
  currencies: readonly string[];
  createPayment(order: PayableOrder, urls: PaymentUrls): Promise<CreatedPayment>;
  /** Vérifie l'authenticité d'un webhook et le traduit ; renvoie null pour un événement sans intérêt. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentNotification | null>;
}
