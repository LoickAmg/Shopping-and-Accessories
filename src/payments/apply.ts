import type { Db } from "@/db/client";
import { paymentEvents } from "@/db/schema";
import { getOrder, markOrderPaid } from "@/server/orders";
import type { PaymentOutcome } from "@/server/orders";

import type { PaymentNotification } from "./types";

export type ApplyResult =
  | { result: "applied"; outcome: PaymentOutcome }
  | { result: "ignored"; reason: "not_paid" }
  | { result: "rejected"; reason: "unknown_order" | "amount_mismatch" | "currency_mismatch" };

/**
 * Traite l'avis d'un fournisseur de paiement. Deux garde-fous :
 * - le montant et la devise encaissés doivent être exactement ceux de la
 *   commande (sinon un client pourrait payer moins cher) ;
 * - l'opération est idempotente : un webhook rejoué n'a aucun effet de plus.
 * L'événement est journalisé après traitement, avec son identifiant unique.
 */
export async function applyPaymentNotification(db: Db, provider: string, notification: PaymentNotification): Promise<ApplyResult> {
  let result: ApplyResult;

  if (notification.status !== "paid") {
    result = { result: "ignored", reason: "not_paid" };
  } else {
    const order = await getOrder(db, notification.orderId);
    if (!order) result = { result: "rejected", reason: "unknown_order" };
    else if (notification.currency.toUpperCase() !== order.currency.toUpperCase())
      result = { result: "rejected", reason: "currency_mismatch" };
    else if (notification.amountMinor !== order.totalCents) result = { result: "rejected", reason: "amount_mismatch" };
    else result = { result: "applied", outcome: await markOrderPaid(db, order.id, { reference: notification.reference }) };
  }

  await db
    .insert(paymentEvents)
    .values({ provider, eventId: notification.eventId, payload: { notification, result } })
    .onConflictDoNothing();
  return result;
}
