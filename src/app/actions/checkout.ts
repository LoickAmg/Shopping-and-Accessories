"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { orders } from "@/db/schema";
import { enabledProviders, siteUrl } from "@/payments/registry";
import { PaymentProviderError } from "@/payments/types";
import type { PayableOrder } from "@/payments/types";
import { getCartView } from "@/server/cart";
import { getCartId, getCurrentUser, getDisplayCurrency } from "@/server/context";
import { EmptyCartError, OutOfStockError, cancelOrderAndRestoreCart, createOrder } from "@/server/orders";
import { clientFingerprint } from "@/server/request";
import { hitRateLimit } from "@/server/rate-limit";

export interface CheckoutState {
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

const required = (label: string, min = 1, max = 120) =>
  z.string().trim().min(min, `${label} est obligatoire.`).max(max, `${label} est trop long.`);

function schemaFor(providerIds: string[]) {
  return z.object({
    email: z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160),
    name: required("Le nom", 2, 100),
    line1: required("L'adresse", 3, 160),
    line2: z.string().trim().max(160).optional(),
    postalCode: required("Le code postal", 2, 12),
    city: required("La ville", 2, 80),
    country: z.string().refine((code) => store.shipping.countries.includes(code), "Pays non desservi."),
    phone: z.string().trim().max(30).optional(),
    provider: z.string().refine((id) => providerIds.includes(id), "Mode de paiement indisponible."),
    terms: z.literal("on", { error: "Vous devez accepter les conditions de vente." }),
  });
}

/** Adresse par laquelle le visiteur est arrivé : les URL de retour de paiement doivent pointer au même endroit. */
async function requestOrigin(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  if (!host) return siteUrl();
  const forwarded = incoming.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwarded ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function placeOrderAction(_previous: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { ...raw };
  delete values.terms;

  const db = await getDb();
  const providers = enabledProviders();
  const parsed = schemaFor(providers.map((provider) => provider.id)).safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }

  const limit = await hitRateLimit(db, `checkout:${clientFingerprint(await headers())}`, { max: 10, windowSeconds: 3600 });
  if (!limit.allowed) return { message: "Trop de tentatives de commande. Réessayez dans un moment.", values };

  const cartId = await getCartId();
  const cart = await getCartView(db, cartId);
  if (!cartId || cart.lines.length === 0) return { message: "Votre panier est vide.", values };
  if (cart.hasProblem) return { message: "Certains articles ne sont plus disponibles : vérifiez votre panier.", values };

  const user = await getCurrentUser();
  const data = parsed.data;
  const provider = providers.find((candidate) => candidate.id === data.provider)!;
  const currency = await getDisplayCurrency();
  const isBaseCurrency = currency.code === store.currency.code;

  let order;
  try {
    order = await createOrder(db, {
      cartId,
      userId: user?.id ?? null,
      email: data.email,
      customerName: data.name,
      address: { line1: data.line1, line2: data.line2 || undefined, postalCode: data.postalCode, city: data.city, country: data.country, phone: data.phone || undefined },
      paymentProvider: provider.id,
      currency: currency.code,
      shipping: store.shipping,
      reservationMinutes: store.orderReservationMinutes,
      // La devise choisie par le visiteur (cookie) est revérifiée ici : ce n'est jamais le
      // formulaire qui décide dans quelle devise la commande est facturée.
      convert: isBaseCurrency
        ? undefined
        : { exponent: currency.exponent, rateMicros: currency.rateMicros, baseExponent: store.currency.exponent },
    });
  } catch (error) {
    if (error instanceof OutOfStockError) return { message: `Stock insuffisant pour : ${error.productNames.join(", ")}. Vérifiez votre panier.`, values };
    if (error instanceof EmptyCartError) return { message: "Votre panier est vide.", values };
    throw error;
  }

  const payable: PayableOrder = {
    id: order.id,
    number: order.number,
    email: order.email,
    customerName: order.customerName,
    totalCents: order.totalCents,
    shippingCents: order.shippingCents,
    currency: order.currency,
    accessToken: order.accessToken,
    items: order.items.map((item) => ({ name: item.name, unitPriceCents: item.unitPriceCents, quantity: item.quantity })),
  };

  const base = await requestOrigin();
  let redirectUrl: string;
  try {
    const created = await provider.createPayment(payable, {
      returnUrl: `${base}/commande/${order.id}?token=${order.accessToken}`,
      cancelUrl: `${base}/commande/${order.id}?token=${order.accessToken}&annule=1`,
      webhookUrl: `${base}/api/webhooks/${provider.id}`,
    });
    await db.update(orders).set({ paymentReference: created.reference }).where(eq(orders.id, order.id));
    redirectUrl = created.redirectUrl;
  } catch (error) {
    await cancelOrderAndRestoreCart(db, order.id, cartId);
    console.error("Création du paiement impossible :", error);
    const detail = error instanceof PaymentProviderError ? " Le service de paiement a refusé la demande." : "";
    return { message: `Le paiement n'a pas pu être démarré.${detail} Votre panier a été conservé, réessayez.`, values };
  }

  redirect(redirectUrl);
}
