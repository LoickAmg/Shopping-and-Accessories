import { store } from "@/config/store";
import { orderMoney } from "@/lib/format";
import { siteUrl } from "@/payments/registry";

import type { OrderWithItems } from "./orders";

export interface Email {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(email: Email): Promise<void>;
}

/** Sans clé d'envoi, les e-mails sont écrits dans les journaux : la boutique marche sans compte d'envoi. */
export function createLogMailer(log: (line: string) => void = console.info): Mailer {
  return {
    async send(email) {
      log(`[e-mail non envoyé — aucun service configuré] à ${email.to} : ${email.subject}`);
    },
  };
}

/** Resend (https://resend.com) : une seule requête HTTP, aucune dépendance. */
export function createResendMailer(options: { apiKey: string; from: string; fetchImpl?: typeof fetch }): Mailer {
  const request = options.fetchImpl ?? fetch;
  return {
    async send(email) {
      const response = await request("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: options.from, to: [email.to], subject: email.subject, text: email.text }),
      });
      if (!response.ok) throw new Error(`Envoi d'e-mail refusé (${response.status}).`);
    },
  };
}

export function getMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return createLogMailer();
  return createResendMailer({ apiKey, from: env.MAIL_FROM?.trim() || `${store.name} <onboarding@resend.dev>` });
}

export function orderConfirmationEmail(order: OrderWithItems): Email {
  const money = (minor: number) => orderMoney(minor, order.currency);
  const lines = order.items.map((item) => `- ${item.quantity} × ${item.name} : ${money(item.unitPriceCents * item.quantity)}`).join("\n");
  const address = order.shippingAddress;
  const link = `${siteUrl()}/commande/${order.id}?token=${order.accessToken}`;

  return {
    to: order.email,
    subject: `Commande n° ${order.number} confirmée — ${store.name}`,
    text: [
      `Bonjour ${order.customerName},`,
      "",
      `Nous avons bien reçu votre paiement pour la commande n° ${order.number}.`,
      "",
      lines,
      "",
      `Livraison : ${order.shippingCents === 0 ? "offerte" : money(order.shippingCents)}`,
      `Total : ${money(order.totalCents)}`,
      "",
      "Adresse de livraison :",
      order.customerName,
      address.line1,
      ...(address.line2 ? [address.line2] : []),
      `${address.postalCode} ${address.city}`,
      address.country,
      "",
      `Suivre la commande : ${link}`,
      "",
      store.name,
    ].join("\n"),
  };
}

/** Envoie la confirmation ; une panne d'e-mail ne doit jamais faire échouer un paiement déjà encaissé. */
export async function sendOrderConfirmation(order: OrderWithItems, mailer: Mailer = getMailer()): Promise<boolean> {
  try {
    await mailer.send(orderConfirmationEmail(order));
    return true;
  } catch (error) {
    console.error("Confirmation de commande non envoyée :", error);
    return false;
  }
}
