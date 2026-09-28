import type { Db } from "@/db/client";
import { getOrder } from "@/server/orders";
import { sendOrderConfirmation } from "@/server/mailer";

import { applyPaymentNotification } from "./apply";
import type { ApplyResult } from "./apply";
import type { PaymentNotification } from "./types";

/** Applique un avis de paiement et, si la commande vient d'être payée, envoie la confirmation. */
export async function processPaymentNotification(db: Db, provider: string, notification: PaymentNotification): Promise<ApplyResult> {
  const result = await applyPaymentNotification(db, provider, notification);
  if (result.result === "applied" && (result.outcome.outcome === "paid" || result.outcome.outcome === "paid_after_expiry")) {
    const order = await getOrder(db, notification.orderId);
    if (order) await sendOrderConfirmation(order);
  }
  return result;
}
