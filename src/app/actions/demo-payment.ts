"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { processPaymentNotification } from "@/payments/process";
import { getProvider } from "@/payments/registry";
import { getOrderWithToken } from "@/server/orders";

/** Simule la réponse de l'agrégateur : « payer » valide la commande, « refuser » la laisse en attente. */
export async function completeDemoPaymentAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get("orderId") ?? "");
  const token = String(formData.get("token") ?? "");
  const outcome = formData.get("outcome") === "refuse" ? "refuse" : "pay";

  const db = await getDb();
  const order = await getOrderWithToken(db, orderId, token);
  if (!order || order.paymentProvider !== "demo" || !getProvider("demo")) redirect("/");

  if (outcome === "refuse") redirect(`/commande/${order.id}?token=${order.accessToken}&annule=1`);

  await processPaymentNotification(db, "demo", {
    eventId: `demo_${randomUUID()}`,
    orderId: order.id,
    reference: `demo_${order.id}`,
    status: "paid",
    amountMinor: order.totalCents,
    currency: order.currency,
  });
  redirect(`/commande/${order.id}?token=${order.accessToken}`);
}
