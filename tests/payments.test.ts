import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import { orders, paymentEvents, products } from "@/db/schema";
import { applyPaymentNotification } from "@/payments/apply";
import { createDemoProvider } from "@/payments/demo";
import { ProviderConfigError, enabledProviders } from "@/payments/registry";
import { createStripeProvider, signStripePayload, verifySignature } from "@/payments/stripe";
import { InvalidSignatureError, PaymentProviderError } from "@/payments/types";
import type { PayableOrder } from "@/payments/types";
import { addToCart } from "@/server/cart";
import { createOrder } from "@/server/orders";

import { createTestDb, resetDb } from "./helpers";

const SECRET = "whsec_test_secret";
const NOW = 1_800_000_000;

const ORDER: PayableOrder = {
  id: "11111111-1111-4111-8111-111111111111",
  number: 42,
  email: "client@exemple.test",
  customerName: "Client",
  totalCents: 10500,
  shippingCents: 500,
  currency: "EUR",
  accessToken: "jeton",
  items: [{ name: "Carnet", unitPriceCents: 5000, quantity: 2 }],
};

const URLS = { returnUrl: "https://boutique.test/commande", cancelUrl: "https://boutique.test/panier", webhookUrl: "https://boutique.test/api/webhooks/stripe" };

describe("signature de webhook Stripe", () => {
  const body = '{"id":"evt_1"}';

  it("accepte une signature valide", () => {
    expect(() => verifySignature(body, signStripePayload(body, SECRET, NOW), SECRET, NOW)).not.toThrow();
  });

  it("refuse un corps modifié, un mauvais secret, un en-tête absent ou illisible", () => {
    const header = signStripePayload(body, SECRET, NOW);
    expect(() => verifySignature('{"id":"evt_2"}', header, SECRET, NOW)).toThrow(InvalidSignatureError);
    expect(() => verifySignature(body, header, "autre_secret", NOW)).toThrow(InvalidSignatureError);
    expect(() => verifySignature(body, null, SECRET, NOW)).toThrow(InvalidSignatureError);
    expect(() => verifySignature(body, "n'importe quoi", SECRET, NOW)).toThrow(InvalidSignatureError);
    expect(() => verifySignature(body, `t=${NOW},v1=zz`, SECRET, NOW)).toThrow(InvalidSignatureError);
  });

  it("refuse un horodatage trop ancien ou trop lointain (rejeu)", () => {
    const header = signStripePayload(body, SECRET, NOW);
    expect(() => verifySignature(body, header, SECRET, NOW + 301)).toThrow(/tolérance/);
    expect(() => verifySignature(body, header, SECRET, NOW - 301)).toThrow(/tolérance/);
    expect(() => verifySignature(body, header, SECRET, NOW + 299)).not.toThrow();
  });

  it("accepte l'une quelconque des signatures listées (rotation de secret)", () => {
    const good = signStripePayload(body, SECRET, NOW);
    const header = `${good},v1=${"0".repeat(64)}`;
    expect(() => verifySignature(body, header, SECRET, NOW)).not.toThrow();
  });
});

describe("Stripe : création d'une session de paiement", () => {
  it("envoie la commande, les frais de port et la bonne devise, et renvoie l'URL", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const provider = createStripeProvider({
      secretKey: "sk_test_abc",
      webhookSecret: SECRET,
      now: () => NOW * 1000,
      fetchImpl: (async (url: string, init: RequestInit) => {
        captured = { url, init };
        return new Response(JSON.stringify({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }), { status: 200 });
      }) as unknown as typeof fetch,
    });

    const created = await provider.createPayment(ORDER, URLS);
    expect(created).toEqual({ redirectUrl: "https://checkout.stripe.com/c/pay/cs_test_1", reference: "cs_test_1" });

    expect(captured?.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect((captured?.init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_abc");
    const form = new URLSearchParams(String(captured?.init.body));
    expect(form.get("client_reference_id")).toBe(ORDER.id);
    expect(form.get("line_items[0][price_data][currency]")).toBe("eur");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("5000");
    expect(form.get("line_items[0][quantity]")).toBe("2");
    expect(form.get("line_items[1][price_data][product_data][name]")).toBe("Livraison");
    expect(form.get("line_items[1][price_data][unit_amount]")).toBe("500");
    expect(form.get("success_url")).toContain("session_id={CHECKOUT_SESSION_ID}");
    expect(Number(form.get("expires_at"))).toBe(NOW + 31 * 60);
  });

  it("n'ajoute pas de ligne de livraison quand elle est offerte", async () => {
    let body = "";
    const provider = createStripeProvider({
      secretKey: "sk_test_abc",
      webhookSecret: SECRET,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        body = String(init.body);
        return new Response(JSON.stringify({ id: "cs", url: "https://x" }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    await provider.createPayment({ ...ORDER, shippingCents: 0 }, URLS);
    expect(new URLSearchParams(body).get("line_items[1][quantity]")).toBeNull();
  });

  it("remonte l'erreur de Stripe", async () => {
    const provider = createStripeProvider({
      secretKey: "sk_test_abc",
      webhookSecret: SECRET,
      fetchImpl: (async () => new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 })) as unknown as typeof fetch,
    });
    await expect(provider.createPayment(ORDER, URLS)).rejects.toThrow(PaymentProviderError);
    await expect(provider.createPayment(ORDER, URLS)).rejects.toThrow(/Invalid API Key/);
  });
});

describe("Stripe : lecture d'un webhook", () => {
  const provider = createStripeProvider({ secretKey: "sk_test_abc", webhookSecret: SECRET, now: () => NOW * 1000 });

  function webhook(event: object) {
    const raw = JSON.stringify(event);
    return { raw, headers: new Headers({ "stripe-signature": signStripePayload(raw, SECRET, NOW) }) };
  }

  it("traduit un paiement réussi", async () => {
    const { raw, headers } = webhook({
      id: "evt_paid",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", client_reference_id: ORDER.id, payment_status: "paid", amount_total: 10500, currency: "eur" } },
    });
    expect(await provider.parseWebhook(raw, headers)).toEqual({
      eventId: "evt_paid",
      orderId: ORDER.id,
      reference: "cs_1",
      status: "paid",
      amountMinor: 10500,
      currency: "EUR",
    });
  });

  it("ignore une session non payée et les événements sans intérêt", async () => {
    const unpaid = webhook({
      id: "evt_unpaid",
      type: "checkout.session.completed",
      data: { object: { id: "cs_2", client_reference_id: ORDER.id, payment_status: "unpaid", amount_total: 10500, currency: "eur" } },
    });
    expect(await provider.parseWebhook(unpaid.raw, unpaid.headers)).toBeNull();

    const other = webhook({ id: "evt_x", type: "charge.refunded", data: { object: { id: "ch_1" } } });
    expect(await provider.parseWebhook(other.raw, other.headers)).toBeNull();
  });

  it("refuse un webhook non signé", async () => {
    await expect(provider.parseWebhook("{}", new Headers())).rejects.toBeInstanceOf(InvalidSignatureError);
  });
});

describe("adresse du site", () => {
  it("préfère SITE_URL, puis le domaine de production, puis l'adresse du déploiement", async () => {
    const { siteUrl } = await import("@/payments/registry");
    expect(siteUrl({ SITE_URL: "https://boutique.test" })).toBe("https://boutique.test");
    expect(siteUrl({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "etal.vercel.app", VERCEL_URL: "etal-abc.vercel.app" })).toBe("https://etal.vercel.app");
    expect(siteUrl({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "etal.vercel.app", VERCEL_URL: "etal-abc.vercel.app" })).toBe("https://etal-abc.vercel.app");
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});

describe("paiement de démonstration", () => {
  it("renvoie vers la page de la boutique avec le jeton de la commande", async () => {
    const provider = createDemoProvider();
    const created = await provider.createPayment(ORDER, URLS);
    expect(created.redirectUrl).toBe(`https://boutique.test/paiement/demo/${ORDER.id}?token=jeton`);
    expect(created.reference).toBe(`demo_${ORDER.id}`);
  });
});

describe("configuration des fournisseurs", () => {
  it("utilise le paiement de démonstration par défaut", () => {
    expect(enabledProviders({}).map((provider) => provider.id)).toEqual(["demo"]);
  });

  it("refuse la démonstration quand la boutique se déclare en vente réelle", () => {
    expect(() => enabledProviders({ SHOP_DEMO_NOTICE: "false" })).toThrow(ProviderConfigError);
  });

  it("exige les clés de Stripe et refuse une clé de production sans confirmation", () => {
    expect(() => enabledProviders({ PAYMENT_PROVIDERS: "stripe" })).toThrow(/STRIPE_SECRET_KEY/);
    expect(() => enabledProviders({ PAYMENT_PROVIDERS: "stripe", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "w" })).toThrow(/ALLOW_LIVE_PAYMENTS/);
    expect(
      enabledProviders({ PAYMENT_PROVIDERS: "stripe", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "w" }).map((p) => p.id),
    ).toEqual(["stripe"]);
    expect(
      enabledProviders({ PAYMENT_PROVIDERS: "stripe", STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "w", ALLOW_LIVE_PAYMENTS: "true" }),
    ).toHaveLength(1);
  });

  it("refuse un fournisseur inconnu", () => {
    expect(() => enabledProviders({ PAYMENT_PROVIDERS: "inconnu" })).toThrow(/inconnu/);
  });
});

describe("application d'un avis de paiement", () => {
  let db: Db;
  let orderId: string;
  let totalCents: number;

  beforeAll(async () => {
    db = await createTestDb();
  });

  beforeEach(async () => {
    await resetDb(db, { seeded: true });
    const [product] = await db.select().from(products).where(eq(products.slug, "cabas-double-soufflet-noir"));
    const { cartId } = await addToCart(db, { productId: product.id, quantity: 2 });
    const order = await createOrder(db, {
      cartId,
      userId: null,
      email: "client@exemple.test",
      customerName: "Client",
      address: { line1: "1 rue A", postalCode: "75001", city: "Paris", country: "FR" },
      paymentProvider: "stripe",
      currency: "EUR",
      shipping: { flatCents: 500, freeOverCents: 0 },
      reservationMinutes: 30,
    });
    orderId = order.id;
    totalCents = order.totalCents;
  });

  const paid = (overrides = {}) => ({
    eventId: "evt_1",
    orderId,
    reference: "cs_1",
    status: "paid" as const,
    amountMinor: totalCents,
    currency: "EUR",
    ...overrides,
  });

  it("valide la commande quand le montant et la devise correspondent", async () => {
    const result = await applyPaymentNotification(db, "stripe", paid({ amountMinor: totalCents }));
    expect(result).toEqual({ result: "applied", outcome: { outcome: "paid" } });
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(row.status).toBe("paid");
  });

  it("refuse un montant inférieur ou supérieur, et une autre devise", async () => {
    expect(await applyPaymentNotification(db, "stripe", paid({ eventId: "a", amountMinor: totalCents - 1 }))).toEqual({
      result: "rejected",
      reason: "amount_mismatch",
    });
    expect(await applyPaymentNotification(db, "stripe", paid({ eventId: "b", amountMinor: totalCents + 1 }))).toMatchObject({
      reason: "amount_mismatch",
    });
    expect(await applyPaymentNotification(db, "stripe", paid({ eventId: "c", currency: "USD" }))).toEqual({
      result: "rejected",
      reason: "currency_mismatch",
    });
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(row.status).toBe("pending");
  });

  it("ignore un avis qui n'est pas un paiement réussi", async () => {
    expect(await applyPaymentNotification(db, "stripe", paid({ status: "failed" }))).toEqual({ result: "ignored", reason: "not_paid" });
    const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(row.status).toBe("pending");
  });

  it("rejette une commande inconnue", async () => {
    const result = await applyPaymentNotification(db, "stripe", paid({ orderId: "22222222-2222-4222-8222-222222222222" }));
    expect(result).toEqual({ result: "rejected", reason: "unknown_order" });
  });

  it("supporte le rejeu du même webhook sans effet de plus et le journalise une seule fois", async () => {
    await applyPaymentNotification(db, "stripe", paid());
    const replay = await applyPaymentNotification(db, "stripe", paid());
    expect(replay).toEqual({ result: "applied", outcome: { outcome: "already_paid" } });
    expect(await db.select().from(paymentEvents)).toHaveLength(1);
  });
});
