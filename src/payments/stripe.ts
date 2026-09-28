import { createHmac, timingSafeEqual } from "node:crypto";

import { InvalidSignatureError, PaymentProviderError } from "./types";
import type { CreatedPayment, PayableOrder, PaymentNotification, PaymentProvider, PaymentUrls } from "./types";

const API = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_SECONDS = 300;
/** Stripe impose une durée de session d'au moins 30 minutes. */
const SESSION_MINUTES = 31;

export interface StripeOptions {
  secretKey: string;
  webhookSecret: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * Stripe Checkout, en mode test tant que la clé commence par `sk_test_`. Écrit
 * sans SDK : trois appels HTTP et une signature HMAC, entièrement testables.
 */
export function createStripeProvider(options: StripeOptions): PaymentProvider {
  const { secretKey, webhookSecret } = options;
  const request = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());

  return {
    id: "stripe",
    label: "Carte bancaire (Stripe)",
    currencies: [],

    async createPayment(order: PayableOrder, urls: PaymentUrls): Promise<CreatedPayment> {
      const currency = order.currency.toLowerCase();
      const body = new URLSearchParams();
      body.set("mode", "payment");
      body.set("client_reference_id", order.id);
      body.set("customer_email", order.email);
      body.set("success_url", `${urls.returnUrl}${urls.returnUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`);
      body.set("cancel_url", urls.cancelUrl);
      body.set("expires_at", String(Math.floor(now() / 1000) + SESSION_MINUTES * 60));
      body.set("metadata[order_id]", order.id);
      body.set("metadata[order_number]", String(order.number));

      const lines = order.items.map((item) => ({ name: item.name, unit: item.unitPriceCents, quantity: item.quantity }));
      if (order.shippingCents > 0) lines.push({ name: "Livraison", unit: order.shippingCents, quantity: 1 });
      lines.forEach((line, index) => {
        body.set(`line_items[${index}][quantity]`, String(line.quantity));
        body.set(`line_items[${index}][price_data][currency]`, currency);
        body.set(`line_items[${index}][price_data][unit_amount]`, String(line.unit));
        body.set(`line_items[${index}][price_data][product_data][name]`, line.name);
      });

      const response = await request(`${API}/checkout/sessions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const json = (await response.json().catch(() => ({}))) as { id?: string; url?: string; error?: { message?: string } };
      if (!response.ok || !json.id || !json.url) {
        throw new PaymentProviderError(json.error?.message ?? `Stripe a répondu ${response.status}.`);
      }
      return { redirectUrl: json.url, reference: json.id };
    },

    async parseWebhook(rawBody: string, headers: Headers): Promise<PaymentNotification | null> {
      verifySignature(rawBody, headers.get("stripe-signature"), webhookSecret, Math.floor(now() / 1000));

      const event = JSON.parse(rawBody) as {
        id: string;
        type: string;
        data: { object: { id: string; client_reference_id?: string; payment_status?: string; amount_total?: number; currency?: string } };
      };
      const session = event.data.object;

      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        if (session.payment_status !== "paid" || !session.client_reference_id) return null;
        return {
          eventId: event.id,
          orderId: session.client_reference_id,
          reference: session.id,
          status: "paid",
          amountMinor: session.amount_total ?? -1,
          currency: (session.currency ?? "").toUpperCase(),
        };
      }
      return null;
    },
  };
}

/** Schéma Stripe : `t=<horodatage>,v1=<HMAC-SHA256 de "<t>.<corps>">`, avec tolérance d'horloge. */
export function verifySignature(rawBody: string, header: string | null, secret: string, nowSeconds: number): void {
  if (!header) throw new InvalidSignatureError("En-tête stripe-signature absent.");

  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0) throw new InvalidSignatureError("En-tête stripe-signature illisible.");

  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new InvalidSignatureError("Horodatage du webhook hors tolérance.");
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  const valid = signatures.some((signature) => {
    const candidate = Buffer.from(signature, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
  if (!valid) throw new InvalidSignatureError();
}

/** Génère un en-tête valide : utilisé par les tests et par les essais manuels. */
export function signStripePayload(rawBody: string, secret: string, timestampSeconds: number): string {
  const signature = createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex");
  return `t=${timestampSeconds},v1=${signature}`;
}
