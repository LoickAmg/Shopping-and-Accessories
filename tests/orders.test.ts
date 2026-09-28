import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import { orders, products } from "@/db/schema";
import type { ShippingAddress } from "@/db/schema";
import { MAX_PER_LINE, addToCart, getCartView, mergeGuestCart, removeFromCart, setQuantity } from "@/server/cart";
import { UnavailableProductError } from "@/server/cart";
import {
  EmptyCartError,
  OutOfStockError,
  cancelOrder,
  cancelOrderAndRestoreCart,
  createOrder,
  expireStaleOrders,
  fulfillOrder,
  getOrderWithToken,
  markOrderPaid,
  markOrderPaidManually,
  markOrderRefunded,
} from "@/server/orders";
import { computeTotals } from "@/server/pricing";
import type { ShippingRules } from "@/server/pricing";
import { registerUser } from "@/server/auth";

import { createTestDb, resetDb } from "./helpers";

const ADDRESS: ShippingAddress = { line1: "12 rue du Marché", postalCode: "75011", city: "Paris", country: "FR" };
const SHIPPING: ShippingRules = { flatCents: 500, freeOverCents: 10000 };

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetDb(db, { seeded: true });
});

async function productBySlug(slug: string) {
  const [row] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  return row;
}

async function stockOf(slug: string): Promise<number> {
  return (await productBySlug(slug)).stock;
}

async function cartWith(slug: string, quantity: number, cartId?: string) {
  const product = await productBySlug(slug);
  return addToCart(db, { cartId, productId: product.id, quantity });
}

function checkout(cartId: string, overrides: Partial<Parameters<typeof createOrder>[1]> = {}) {
  return createOrder(db, {
    cartId,
    userId: null,
    email: "Client@Exemple.test",
    customerName: "Client Test",
    address: ADDRESS,
    paymentProvider: "demo",
    currency: "EUR",
    shipping: SHIPPING,
    reservationMinutes: 30,
    ...overrides,
  });
}

describe("frais de port", () => {
  it("applique le forfait, l'offre au-delà du seuil et rien pour un panier vide", () => {
    expect(computeTotals(0, SHIPPING)).toMatchObject({ shippingCents: 0, totalCents: 0, freeShippingRemainingCents: null });
    expect(computeTotals(4000, SHIPPING)).toMatchObject({ shippingCents: 500, totalCents: 4500, freeShippingRemainingCents: 6000 });
    expect(computeTotals(10000, SHIPPING)).toMatchObject({ shippingCents: 0, totalCents: 10000, freeShippingRemainingCents: null });
    expect(computeTotals(4000, { flatCents: 500, freeOverCents: 0 }).freeShippingRemainingCents).toBeNull();
  });
});

describe("panier", () => {
  it("crée un panier, additionne les quantités et calcule le sous-total", async () => {
    const first = await cartWith("tote-clochette-noir", 2);
    await cartWith("cabas-double-soufflet-noir", 1, first.cartId);
    await cartWith("cabas-double-soufflet-noir", 2, first.cartId);

    const cart = await getCartView(db, first.cartId);
    expect(cart.itemCount).toBe(5);
    expect(cart.lines.find((line) => line.product.slug === "cabas-double-soufflet-noir")?.quantity).toBe(3);
    expect(cart.subtotalCents).toBe(cart.lines.reduce((sum, line) => sum + line.product.priceCents * line.quantity, 0));
    expect(cart.hasProblem).toBe(false);
  });

  it("plafonne la quantité au stock et à la limite par ligne", async () => {
    const limited = await cartWith("sac-cartable-clou-noir", 10);
    expect(limited.quantity).toBe(3);

    const plenty = await cartWith("cabas-double-soufflet-noir", 50);
    expect(plenty.quantity).toBe(MAX_PER_LINE);
  });

  it("refuse un produit épuisé ou inconnu", async () => {
    await expect(cartWith("seau-croco-a-fermoir-dore", 1)).rejects.toBeInstanceOf(UnavailableProductError);
    await expect(addToCart(db, { productId: 99999, quantity: 1 })).rejects.toBeInstanceOf(UnavailableProductError);
  });

  it("modifie et supprime des lignes", async () => {
    const { cartId } = await cartWith("cabas-double-soufflet-noir", 1);
    const product = await productBySlug("cabas-double-soufflet-noir");

    await setQuantity(db, cartId, product.id, 4);
    expect((await getCartView(db, cartId)).itemCount).toBe(4);
    await setQuantity(db, cartId, product.id, 0);
    expect((await getCartView(db, cartId)).lines).toHaveLength(0);

    await cartWith("cabas-double-soufflet-noir", 1, cartId);
    await removeFromCart(db, cartId, product.id);
    expect((await getCartView(db, cartId)).itemCount).toBe(0);
  });

  it("signale un article devenu indisponible ou en quantité excessive", async () => {
    const { cartId } = await cartWith("sac-cartable-clou-noir", 3);
    await db.update(products).set({ stock: 1 }).where(eq(products.slug, "sac-cartable-clou-noir"));
    let cart = await getCartView(db, cartId);
    expect(cart.lines[0].problem).toBe("insufficient");
    expect(cart.hasProblem).toBe(true);

    await db.update(products).set({ stock: 0 }).where(eq(products.slug, "sac-cartable-clou-noir"));
    cart = await getCartView(db, cartId);
    expect(cart.lines[0].problem).toBe("unavailable");
  });

  it("fusionne le panier d'invité dans celui du compte à la connexion", async () => {
    const user = await registerUser(db, { email: "fusion@exemple.test", password: "mot de passe long", name: "Fusion" });
    const account = await addToCart(db, {
      userId: user.id,
      productId: (await productBySlug("cabas-double-soufflet-noir")).id,
      quantity: 2,
    });
    const guest = await cartWith("cabas-double-soufflet-noir", 3);
    await cartWith("tote-clochette-noir", 1, guest.cartId);

    const merged = await mergeGuestCart(db, guest.cartId, user.id);
    expect(merged).toBe(account.cartId);

    const cart = await getCartView(db, merged);
    expect(cart.lines.find((line) => line.product.slug === "cabas-double-soufflet-noir")?.quantity).toBe(5);
    expect(cart.lines.find((line) => line.product.slug === "tote-clochette-noir")?.quantity).toBe(1);
    expect((await getCartView(db, guest.cartId)).lines).toHaveLength(0);
  });

  it("rattache directement le panier d'invité quand le compte n'en a pas", async () => {
    const user = await registerUser(db, { email: "adopt@exemple.test", password: "mot de passe long", name: "Adopt" });
    const guest = await cartWith("cabas-double-soufflet-noir", 2);
    expect(await mergeGuestCart(db, guest.cartId, user.id)).toBe(guest.cartId);
  });
});

describe("commande et réservation de stock", () => {
  it("crée la commande, fige les prix, retire le stock et vide le panier", async () => {
    const before = await stockOf("cabas-double-soufflet-noir");
    const { cartId } = await cartWith("cabas-double-soufflet-noir", 3);
    const order = await checkout(cartId);

    expect(order.status).toBe("pending");
    expect(order.email).toBe("client@exemple.test");
    expect(order.items).toHaveLength(1);
    expect(order.subtotalCents).toBe(order.items[0].unitPriceCents * 3);
    expect(order.totalCents).toBe(order.subtotalCents + order.shippingCents);
    expect(order.accessToken.length).toBeGreaterThan(20);
    expect(await stockOf("cabas-double-soufflet-noir")).toBe(before - 3);
    expect((await getCartView(db, cartId)).lines).toHaveLength(0);
  });

  it("garde le prix d'achat même si le catalogue change ensuite", async () => {
    const { cartId } = await cartWith("cabas-double-soufflet-noir", 1);
    const order = await checkout(cartId);
    await db.update(products).set({ priceCents: 999999 }).where(eq(products.slug, "cabas-double-soufflet-noir"));
    const [item] = (await getOrderWithToken(db, order.id, order.accessToken))!.items;
    expect(item.unitPriceCents).toBe(order.items[0].unitPriceCents);
    expect(item.unitPriceCents).not.toBe(999999);
  });

  it("refuse un panier vide", async () => {
    const { cartId } = await cartWith("cabas-double-soufflet-noir", 1);
    await checkout(cartId);
    await expect(checkout(cartId)).rejects.toBeInstanceOf(EmptyCartError);
  });

  it("annule toute la commande si un seul article manque, sans toucher au stock", async () => {
    const { cartId } = await cartWith("cabas-double-soufflet-noir", 2);
    await cartWith("sac-cartable-clou-noir", 3, cartId);
    await db.update(products).set({ stock: 1 }).where(eq(products.slug, "sac-cartable-clou-noir"));

    const soapBefore = await stockOf("cabas-double-soufflet-noir");
    await expect(checkout(cartId)).rejects.toBeInstanceOf(OutOfStockError);
    expect(await stockOf("cabas-double-soufflet-noir")).toBe(soapBefore);
    expect(await stockOf("sac-cartable-clou-noir")).toBe(1);
    expect(await db.select().from(orders)).toHaveLength(0);
    expect((await getCartView(db, cartId)).lines).toHaveLength(2);
  });

  it("ne vend jamais la dernière pièce deux fois, même en simultané", async () => {
    await db.update(products).set({ stock: 1 }).where(eq(products.slug, "sac-bowling-zip-noir"));
    const carts = await Promise.all(Array.from({ length: 5 }, () => cartWith("sac-bowling-zip-noir", 1)));

    const results = await Promise.allSettled(carts.map((cart) => checkout(cart.cartId)));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(4);
    expect(await stockOf("sac-bowling-zip-noir")).toBe(0);
    expect(await db.select().from(orders)).toHaveLength(1);
  });

  it("numérote les commandes de façon croissante", async () => {
    const a = await checkout((await cartWith("cabas-double-soufflet-noir", 1)).cartId);
    const b = await checkout((await cartWith("cabas-double-soufflet-noir", 1)).cartId);
    expect(b.number).toBeGreaterThan(a.number);
  });
});

describe("commande dans une autre devise que le catalogue", () => {
  // Prix catalogue en XOF (exposant 0) ; conversion vers USD (exposant 2), 1 XOF = 0,0016 $.
  const USD = { code: "USD", exponent: 2, rateMicros: 1600 };

  it("convertit chaque prix et enregistre la commande dans la devise cible", async () => {
    const { cartId } = await cartWith("cabas-double-soufflet-noir", 2); // 25 000 XOF l'unité
    const order = await checkout(cartId, {
      currency: USD.code,
      shipping: { flatCents: 2000, freeOverCents: 0 }, // frais de port en devise de base (XOF)
      convert: { ...USD, baseExponent: 0 },
    });

    expect(order.currency).toBe("USD");
    expect(order.items[0].unitPriceCents).toBe(4000); // 25 000 XOF -> 40,00 $
    expect(order.subtotalCents).toBe(8000); // 2 x 40,00 $
    expect(order.shippingCents).toBe(320); // 2 000 XOF -> 3,20 $
    expect(order.totalCents).toBe(order.subtotalCents + order.shippingCents);
  });

  it("sans convert, exige que le panier et les frais de port soient déjà dans la devise annoncée", async () => {
    // Comportement historique (compatibilité) : aucune conversion, les montants sont pris tels quels.
    const { cartId } = await cartWith("cabas-double-soufflet-noir", 1);
    const order = await checkout(cartId, { currency: "USD" });
    expect(order.items[0].unitPriceCents).toBe(25000); // prix catalogue brut, non converti
  });

  it("respecte l'offre de livraison offerte une fois convertie", async () => {
    // 10 x 25 000 (max par ligne) + 1 x 48 000 = 298 000 XOF, au-delà du seuil de 60 000
    const { cartId } = await cartWith("cabas-double-soufflet-noir", 10);
    await cartWith("sac-trapeze-croco-bleu-nuit", 1, cartId);
    const order = await checkout(cartId, {
      currency: USD.code,
      shipping: { flatCents: 2000, freeOverCents: 60000 }, // offerte au-delà de 60 000 XOF, en devise de base
      convert: { ...USD, baseExponent: 0 },
    });
    expect(order.shippingCents).toBe(0);
  });
});

describe("expiration des commandes impayées", () => {
  it("annule les commandes expirées et rend le stock, une seule fois", async () => {
    const before = await stockOf("cabas-double-soufflet-noir");
    const order = await checkout((await cartWith("cabas-double-soufflet-noir", 4)).cartId, { reservationMinutes: 30 });
    expect(await stockOf("cabas-double-soufflet-noir")).toBe(before - 4);

    expect(await expireStaleOrders(db, new Date(Date.now() + 10 * 60 * 1000))).toBe(0);
    expect(await expireStaleOrders(db, new Date(Date.now() + 31 * 60 * 1000))).toBe(1);
    expect(await stockOf("cabas-double-soufflet-noir")).toBe(before);
    expect(await expireStaleOrders(db, new Date(Date.now() + 60 * 60 * 1000))).toBe(0);
    expect(await stockOf("cabas-double-soufflet-noir")).toBe(before);

    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe("expired");
  });

  it("ne touche pas aux commandes déjà payées", async () => {
    const order = await checkout((await cartWith("cabas-double-soufflet-noir", 1)).cartId);
    await markOrderPaid(db, order.id, { reference: "ref-1" });
    expect(await expireStaleOrders(db, new Date(Date.now() + 24 * 60 * 60 * 1000))).toBe(0);
  });
});

describe("paiement", () => {
  it("passe la commande en payée et mémorise la référence", async () => {
    const order = await checkout((await cartWith("cabas-double-soufflet-noir", 1)).cartId);
    expect(await markOrderPaid(db, order.id, { reference: "ref-42" })).toEqual({ outcome: "paid" });

    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe("paid");
    expect(row.paymentReference).toBe("ref-42");
    expect(row.paidAt).not.toBeNull();
  });

  it("est idempotent : un second avis de paiement ne change rien", async () => {
    const order = await checkout((await cartWith("cabas-double-soufflet-noir", 1)).cartId);
    await markOrderPaid(db, order.id, { reference: "ref-1" });
    expect(await markOrderPaid(db, order.id, { reference: "ref-2" })).toEqual({ outcome: "already_paid" });
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.paymentReference).toBe("ref-1");
  });

  it("accepte un paiement tardif si le stock peut être repris", async () => {
    const before = await stockOf("cabas-double-soufflet-noir");
    const order = await checkout((await cartWith("cabas-double-soufflet-noir", 2)).cartId);
    await expireStaleOrders(db, new Date(Date.now() + 60 * 60 * 1000));

    expect(await markOrderPaid(db, order.id, { reference: "late-1" })).toEqual({ outcome: "paid_after_expiry" });
    expect(await stockOf("cabas-double-soufflet-noir")).toBe(before - 2);
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe("paid");
  });

  it("signale un remboursement à faire quand le stock a été vendu entre-temps", async () => {
    await db.update(products).set({ stock: 1 }).where(eq(products.slug, "sac-bowling-zip-noir"));
    const first = await checkout((await cartWith("sac-bowling-zip-noir", 1)).cartId);
    await expireStaleOrders(db, new Date(Date.now() + 60 * 60 * 1000));

    await db.update(products).set({ stock: 1 }).where(eq(products.slug, "sac-bowling-zip-noir"));
    await checkout((await cartWith("sac-bowling-zip-noir", 1)).cartId);

    expect(await markOrderPaid(db, first.id, { reference: "late-2" })).toEqual({ outcome: "needs_refund", reason: "out_of_stock" });
    const [row] = await db.select().from(orders).where(eq(orders.id, first.id));
    expect(row.status).toBe("expired");
    expect(row.paymentReference).toBe("late-2");
    expect(await stockOf("sac-bowling-zip-noir")).toBe(0);
  });

  it("signale un remboursement à faire pour une commande annulée", async () => {
    const order = await checkout((await cartWith("cabas-double-soufflet-noir", 1)).cartId);
    await cancelOrder(db, order.id);
    expect(await markOrderPaid(db, order.id, { reference: "late-3" })).toEqual({ outcome: "needs_refund", reason: "order_cancelled" });
  });

  it("ignore une commande inconnue", async () => {
    expect(await markOrderPaid(db, "00000000-0000-4000-8000-000000000000", { reference: "x" })).toEqual({ outcome: "unknown_order" });
  });
});

describe("annulation et expédition", () => {
  it("annule une commande payée et rend le stock", async () => {
    const before = await stockOf("cabas-double-soufflet-noir");
    const order = await checkout((await cartWith("cabas-double-soufflet-noir", 2)).cartId);
    await markOrderPaid(db, order.id, { reference: "r" });

    expect(await cancelOrder(db, order.id)).toBe(true);
    expect(await stockOf("cabas-double-soufflet-noir")).toBe(before);
    expect(await cancelOrder(db, order.id)).toBe(false);
  });

  it("n'expédie qu'une commande payée, et ne l'annule plus ensuite", async () => {
    const order = await checkout((await cartWith("cabas-double-soufflet-noir", 1)).cartId);
    expect(await fulfillOrder(db, order.id)).toBe(false);
    await markOrderPaid(db, order.id, { reference: "r" });
    expect(await fulfillOrder(db, order.id)).toBe(true);
    expect(await cancelOrder(db, order.id)).toBe(false);
  });
});

describe("échec du démarrage du paiement", () => {
  it("annule la commande, rend le stock et remet les articles dans le panier", async () => {
    const before = await stockOf("cabas-double-soufflet-noir");
    const { cartId } = await cartWith("cabas-double-soufflet-noir", 2);
    await cartWith("tote-clochette-noir", 1, cartId);
    const order = await checkout(cartId);
    expect((await getCartView(db, cartId)).lines).toHaveLength(0);

    expect(await cancelOrderAndRestoreCart(db, order.id, cartId)).toBe(true);
    expect(await stockOf("cabas-double-soufflet-noir")).toBe(before);
    const cart = await getCartView(db, cartId);
    expect(cart.itemCount).toBe(3);
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe("cancelled");
  });

  it("ne fait rien pour une commande déjà payée", async () => {
    const { cartId } = await cartWith("cabas-double-soufflet-noir", 1);
    const order = await checkout(cartId);
    await markOrderPaid(db, order.id, { reference: "r" });
    expect(await cancelOrderAndRestoreCart(db, order.id, cartId)).toBe(true);
  });
});

describe("remboursement et paiement manuel", () => {
  it("solde un paiement à rembourser, et seulement lui", async () => {
    const order = await checkout((await cartWith("cabas-double-soufflet-noir", 1)).cartId);
    expect(await markOrderRefunded(db, order.id)).toBe(false);

    await markOrderPaid(db, order.id, { reference: "ref-9" });
    await cancelOrder(db, order.id);
    expect(await markOrderRefunded(db, order.id)).toBe(true);
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe("refunded");
    expect(await markOrderRefunded(db, order.id)).toBe(false);
  });

  it("enregistre un paiement reçu hors agrégateur", async () => {
    const order = await checkout((await cartWith("cabas-double-soufflet-noir", 1)).cartId);
    expect(await markOrderPaidManually(db, order.id, "virement du 21/09")).toEqual({ outcome: "paid" });
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.status).toBe("paid");
    expect(row.paymentReference).toBe("manuel:virement du 21/09");
  });
});

describe("consultation d'une commande", () => {
  it("exige l'identifiant et le bon jeton", async () => {
    const order = await checkout((await cartWith("cabas-double-soufflet-noir", 1)).cartId);
    expect((await getOrderWithToken(db, order.id, order.accessToken))?.id).toBe(order.id);
    expect(await getOrderWithToken(db, order.id, "mauvais-jeton")).toBeUndefined();
    expect(await getOrderWithToken(db, order.id, order.accessToken + "x")).toBeUndefined();
  });
});
