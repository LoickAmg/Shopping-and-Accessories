import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import { categories, products } from "@/db/schema";
import {
  LOW_STOCK_THRESHOLD,
  createCategory,
  createProduct,
  deleteCategory,
  getDashboardStats,
  setProductActive,
  uniqueProductSlug,
  updateCategory,
  updateProduct,
} from "@/server/admin";
import type { ProductInput } from "@/server/admin";
import { addToCart } from "@/server/cart";
import { getProductBySlug, listProducts } from "@/server/catalog";
import { cancelOrder, createOrder, markOrderPaid } from "@/server/orders";

import { createTestDb, resetDb } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetDb(db, { seeded: true });
});

const NEW_PRODUCT: ProductInput = {
  name: "Lampe à huile en laiton",
  summary: "Laiton brut, verre soufflé.",
  description: "Une lampe qui se patine.",
  categoryId: null,
  priceCents: 12500,
  compareAtCents: null,
  stock: 6,
  active: true,
  tone: "t3",
  imageUrl: null,
  sku: null,
};

describe("produits", () => {
  it("crée un produit visible et cherchable sans accents", async () => {
    const created = await createProduct(db, NEW_PRODUCT);
    expect(created.slug).toBe("lampe-a-huile-en-laiton");
    expect((await listProducts(db, { q: "lampe a huile" })).items.map((item) => item.id)).toContain(created.id);
  });

  it("garantit un identifiant d'URL unique", async () => {
    const first = await createProduct(db, NEW_PRODUCT);
    const second = await createProduct(db, NEW_PRODUCT);
    const third = await createProduct(db, NEW_PRODUCT);
    expect([first.slug, second.slug, third.slug]).toEqual(["lampe-a-huile-en-laiton", "lampe-a-huile-en-laiton-2", "lampe-a-huile-en-laiton-3"]);
    expect(await uniqueProductSlug(db, "Lampe à huile en laiton", first.id)).toBe("lampe-a-huile-en-laiton");
  });

  it("met à jour un produit et sa recherche", async () => {
    const created = await createProduct(db, NEW_PRODUCT);
    await updateProduct(db, created.id, { ...NEW_PRODUCT, name: "Lanterne en cuivre", summary: "Cuivre martelé.", description: "Une lanterne qui se patine." });
    expect((await listProducts(db, { q: "lampe" })).total).toBe(0);
    expect((await listProducts(db, { q: "lanterne" })).total).toBe(1);
  });

  it("archive un produit sans le supprimer, et le retire du catalogue public", async () => {
    const created = await createProduct(db, NEW_PRODUCT);
    await setProductActive(db, created.id, false);
    expect(await getProductBySlug(db, created.slug)).toBeUndefined();
    expect((await listProducts(db, { q: "lampe" })).total).toBe(0);
    await setProductActive(db, created.id, true);
    expect(await getProductBySlug(db, created.slug)).toBeDefined();
  });

  it("refuse un stock négatif et un prix négatif au niveau de la base", async () => {
    await expect(createProduct(db, { ...NEW_PRODUCT, stock: -1 })).rejects.toThrow();
    await expect(createProduct(db, { ...NEW_PRODUCT, priceCents: -5 })).rejects.toThrow();
  });
});

describe("rayons", () => {
  it("crée un rayon avec un identifiant unique", async () => {
    await createCategory(db, { name: "Cabas", description: "", position: 9 });
    const slugs = (await db.select().from(categories)).map((category) => category.slug);
    expect(slugs).toContain("cabas-2");
  });

  it("renommer un rayon met à jour la recherche de ses produits", async () => {
    const [cabas] = await db.select().from(categories).where(eq(categories.slug, "cabas"));
    await updateCategory(db, cabas.id, { name: "Intérieur", description: "", position: 0 });
    expect((await listProducts(db, { q: "interieur", category: "cabas" })).total).toBe(3);
  });

  it("supprimer un rayon garde ses produits au catalogue, sans rayon", async () => {
    const [cabas] = await db.select().from(categories).where(eq(categories.slug, "cabas"));
    await deleteCategory(db, cabas.id);
    const orphans = await db.select().from(products).where(eq(products.categoryId, cabas.id));
    expect(orphans).toHaveLength(0);
    expect((await listProducts(db, { pageSize: 60 })).total).toBe(8);
  });
});

describe("tableau de bord", () => {
  it("compte produits, ruptures et stock bas", async () => {
    const stats = await getDashboardStats(db);
    expect(stats.activeProducts).toBe(8);
    expect(stats.outOfStock).toBe(1);
    expect(stats.lowStock.every((product) => product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD)).toBe(true);
    expect(stats.lowStock.map((product) => product.name)).toContain("Sac Cartable Clou, noir");
  });

  it("totalise le chiffre d'affaires des commandes payées seulement et signale les remboursements", async () => {
    const [soap] = await db.select().from(products).where(eq(products.slug, "cabas-double-soufflet-noir"));
    const place = async () => {
      const { cartId } = await addToCart(db, { productId: soap.id, quantity: 1 });
      return createOrder(db, {
        cartId,
        userId: null,
        email: "c@exemple.test",
        customerName: "C",
        address: { line1: "1 rue A", postalCode: "1", city: "V", country: "FR" },
        paymentProvider: "demo",
        currency: "XOF",
        shipping: { flatCents: 2000, freeOverCents: 0 },
        reservationMinutes: 30,
      });
    };

    const paid = await place();
    await markOrderPaid(db, paid.id, { reference: "r1" });
    await place();
    const refunded = await place();
    await markOrderPaid(db, refunded.id, { reference: "r2" });
    await cancelOrder(db, refunded.id);

    const stats = await getDashboardStats(db);
    expect(stats.paidOrders).toBe(1);
    expect(stats.revenueCents).toBe(paid.totalCents);
    expect(stats.pendingOrders).toBe(1);
    expect(stats.refundsDue).toBe(1);
  });
});
