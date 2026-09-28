import { PaymentProviderError } from "./types";
import type { PayableOrder, PaymentNotification, PaymentProvider, PaymentUrls } from "./types";

/**
 * Fournisseur de démonstration : envoie vers une page de la boutique qui
 * simule un paiement réussi ou refusé. Il permet de tester tout le parcours
 * sans compte chez un agrégateur, et il est refusé dès que la boutique se
 * déclare en vente réelle (`SHOP_DEMO_NOTICE=false`).
 */
export function createDemoProvider(): PaymentProvider {
  return {
    id: "demo",
    label: "Paiement de démonstration",
    currencies: [],

    async createPayment(order: PayableOrder, urls: PaymentUrls) {
      // Même origine que la page de retour : marche en local, en préversion et en production.
      const url = new URL(`/paiement/demo/${order.id}`, new URL(urls.returnUrl).origin);
      url.searchParams.set("token", order.accessToken);
      return { redirectUrl: url.toString(), reference: `demo_${order.id}` };
    },

    async parseWebhook(): Promise<PaymentNotification | null> {
      throw new PaymentProviderError("Le fournisseur de démonstration n'utilise pas de webhook.");
    },
  };
}
