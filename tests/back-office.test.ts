import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import { productVariants, products, sessions, stockMovements, users } from "@/db/schema";
import { can, isStaff } from "@/lib/roles";
import { parseVariantRows } from "@/lib/variant-form";
import { createProduct, describeProductChanges, duplicateProduct, getProductForAdmin, listProductsForAdmin, updateProduct } from "@/server/admin";
import type { ProductInput } from "@/server/admin";
import { listAudit, logAction } from "@/server/audit";
import { createSession, getSessionUser, registerUser } from "@/server/auth";
import { addToCart } from "@/server/cart";
import { cancelOrder, createOrder } from "@/server/orders";
import { adjustStock, listMovements, listStockRows } from "@/server/stock";
import { detectImageType } from "@/server/uploads";
import { listUsers, setUserRole, setUserSuspended } from "@/server/users";

import { createTestDb, resetDb, setStock, stockOf, variantOf } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetDb(db, { seeded: true });
});

const BAG = "cabas-double-soufflet-noir";

async function account(email: string, role: "customer" | "manager" | "admin" = "customer") {
  const user = await registerUser(db, { email, password: "mot de passe long", name: email.split("@")[0] });
  if (role !== "customer") await db.update(users).set({ role }).where(eq(users.id, user.id));
  return { ...user, role };
}

const DRESS: ProductInput = {
  name: "Robe portefeuille, lin bleu",
  summary: "Lin lavé.",
  description: "Coupe portefeuille.",
  categoryId: null,
  priceCents: 25000,
  compareAtCents: null,
  active: true,
  department: "femme",
  condition: "neuf",
  wearGrade: null,
  defects: "",
  material: "Lin",
  tone: "t2",
  imageUrl: "/assets/robe.jpeg",
  gallery: ["/assets/robe-dos.jpeg"],
  sku: "RB-01",
  variants: [
    { size: "S", color: "", sku: "RB-01-S", stock: 2 },
    { size: "M", color: "", sku: "RB-01-M", stock: 4 },
  ],
};

describe("rôles", () => {
  it("le gestionnaire tient la boutique, l'administrateur garde l'argent et les comptes", () => {
    expect(isStaff("manager")).toBe(true);
    expect(isStaff("customer")).toBe(false);
    expect(can("manager", "catalogue")).toBe(true);
    expect(can("manager", "commandes")).toBe(true);
    for (const permission of ["paiements", "devises", "utilisateurs", "journal"] as const) {
      expect(can("manager", permission)).toBe(false);
      expect(can("admin", permission)).toBe(true);
    }
    expect(can("customer", "catalogue")).toBe(false);
  });

  it("un administrateur nomme une gestionnaire puis la rétrograde", async () => {
    const admin = await account("patron@exemple.test", "admin");
    const client = await account("cliente@exemple.test");
    const promoted = await setUserRole(db, admin.id, client.id, "manager");
    expect(promoted.ok && promoted.user.role).toBe("manager");
    const back = await setUserRole(db, admin.id, client.id, "customer");
    expect(back.ok && back.user.role).toBe("customer");
  });

  it("on ne modifie jamais son propre compte", async () => {
    const admin = await account("patron@exemple.test", "admin");
    expect(await setUserRole(db, admin.id, admin.id, "customer")).toEqual({ ok: false, reason: "self" });
    expect(await setUserSuspended(db, admin.id, admin.id, true)).toEqual({ ok: false, reason: "self" });
  });

  it("la boutique garde toujours un administrateur actif", async () => {
    const first = await account("un@exemple.test", "admin");
    const second = await account("deux@exemple.test", "admin");
    // Deux administrateurs : l'un peut rétrograder l'autre…
    expect((await setUserRole(db, first.id, second.id, "manager")).ok).toBe(true);
    // …mais plus personne ne peut retirer le dernier (ici via un administrateur fraîchement rétrogradé, cas d'une requête concurrente).
    expect(await setUserRole(db, second.id, first.id, "customer")).toEqual({ ok: false, reason: "last_admin" });
    expect(await setUserSuspended(db, second.id, first.id, true)).toEqual({ ok: false, reason: "last_admin" });
  });

  it("un compte suspendu perd ses sessions et ne peut plus en ouvrir", async () => {
    const admin = await account("patron@exemple.test", "admin");
    const client = await account("cliente@exemple.test", "manager");
    const { token } = await createSession(db, client.id);
    expect(await getSessionUser(db, token)).not.toBeNull();

    const result = await setUserSuspended(db, admin.id, client.id, true);
    expect(result.ok).toBe(true);
    expect(await db.select().from(sessions).where(eq(sessions.userId, client.id))).toHaveLength(0);

    // Même un jeton encore valide (créé après coup) ne donne plus accès.
    const again = await createSession(db, client.id);
    expect(await getSessionUser(db, again.token)).toBeNull();

    expect((await setUserSuspended(db, admin.id, client.id, false)).ok).toBe(true);
    expect(await getSessionUser(db, again.token)).not.toBeNull();
  });

  it("liste l'équipe d'abord, avec recherche par nom ou adresse", async () => {
    await account("zoe@exemple.test");
    await account("gerante@exemple.test", "manager");
    await account("patron@exemple.test", "admin");
    const all = await listUsers(db);
    expect(all.rows.map((row) => row.role)).toEqual(["admin", "manager", "customer"]);
    expect((await listUsers(db, { q: "GERANTE" })).rows.map((row) => row.email)).toEqual(["gerante@exemple.test"]);
    expect((await listUsers(db, { role: "customer" })).total).toBe(1);
  });
});

describe("journal d'activité", () => {
  it("inscrit l'auteur, l'action et le détail, du plus récent au plus ancien", async () => {
    const admin = await account("patron@exemple.test", "admin");
    await logAction(db, admin, "product.create", { type: "product", id: 1 }, "Robe");
    await logAction(db, admin, "order.cancel", { type: "order", id: "x" }, "Commande n° 3");
    const { rows, total } = await listAudit(db);
    expect(total).toBe(2);
    expect(rows[0]).toMatchObject({ action: "order.cancel", actorEmail: "patron@exemple.test", summary: "Commande n° 3" });
  });
});

describe("stock", () => {
  it("corrige en écart : une vente passée entre-temps n'est pas effacée", async () => {
    const variant = await variantOf(db, BAG);
    await setStock(db, BAG, 5);
    // La page affiche 5 ; pendant ce temps, une vente fait passer le stock à 4.
    await setStock(db, BAG, 4);
    const result = await adjustStock(db, [{ variantId: variant.id, from: 5, to: 8 }], null);
    expect(result.applied).toEqual([{ variantId: variant.id, delta: 3, stock: 7 }]);
    expect(await stockOf(db, BAG)).toBe(7);
  });

  it("refuse une correction qui rendrait le stock négatif", async () => {
    const variant = await variantOf(db, BAG);
    await setStock(db, BAG, 1);
    const result = await adjustStock(db, [{ variantId: variant.id, from: 5, to: 0 }], null);
    expect(result.rejected).toEqual([variant.id]);
    expect(await stockOf(db, BAG)).toBe(1);
  });

  it("garde l'historique : corrections, ventes et retours au stock", async () => {
    const admin = await account("patron@exemple.test", "admin");
    const variant = await variantOf(db, BAG);
    await setStock(db, BAG, 3);
    await adjustStock(db, [{ variantId: variant.id, from: 3, to: 5 }], admin.id);

    const { cartId } = await addToCart(db, { variantId: variant.id, quantity: 2 });
    const order = await createOrder(db, {
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
    await cancelOrder(db, order.id);

    const movements = await listMovements(db, { productId: variant.productId });
    expect(movements.map((movement) => [movement.reason, movement.delta, movement.stockAfter])).toEqual([
      ["restitution", 2, 5],
      ["vente", -2, 3],
      ["ajustement", 2, 5],
    ]);
    expect(movements[2].actorEmail).toBe("patron@exemple.test");
    expect(movements[1].orderId).toBe(order.id);
  });

  it("le formulaire produit applique aussi le stock en écart, et l'historise", async () => {
    const created = await createProduct(db, DRESS);
    const before = await getProductForAdmin(db, created.id);
    const [small, medium] = before!.variants;
    // Une vente de la taille S pendant que le formulaire est ouvert (affiché : 2).
    await db.update(productVariants).set({ stock: 1 }).where(eq(productVariants.id, small.id));
    await updateProduct(db, created.id, {
      ...DRESS,
      variants: [
        { id: small.id, size: "S", color: "", sku: "RB-01-S", stock: 5, originalStock: 2 },
        { id: medium.id, size: "M", color: "", sku: "RB-01-M", stock: 4, originalStock: 4 },
      ],
    });
    const after = await getProductForAdmin(db, created.id);
    expect(after!.variants.map((variant) => variant.stock)).toEqual([4, 4]);
    const rows = await db.select().from(stockMovements).where(eq(stockMovements.variantId, small.id));
    // Création (+2) puis correction (+3) ; la vente simulée ci-dessus est une écriture directe, hors historique.
    expect(rows.map((row) => row.delta).sort()).toEqual([2, 3]);
  });

  it("liste les déclinaisons à corriger, filtrées par niveau et par produit", async () => {
    await setStock(db, BAG, 0);
    const out = await listStockRows(db, { level: "rupture" });
    expect(out.rows.map((row) => row.variantId)).toContain((await variantOf(db, BAG)).id);
    const created = await createProduct(db, DRESS);
    const dress = await listStockRows(db, { productId: created.id });
    expect(dress.rows.map((row) => row.label)).toEqual(["Taille S", "Taille M"]);
    expect((await listStockRows(db, { q: "RB-01-M" })).rows).toHaveLength(1);
  });

  it("lit les quantités affichées du formulaire produit", () => {
    const { variants } = parseVariantRows({ variant_id_0: "7", variant_size_0: "S", variant_stock_0: "5", variant_orig_0: "2", variant_size_1: "M", variant_stock_1: "1", variant_orig_1: "9" });
    expect(variants[0].originalStock).toBe(2);
    // Une ligne nouvelle (sans identifiant) n'a pas de stock « affiché ».
    expect(variants[1].originalStock).toBeUndefined();
  });
});

describe("liste des produits du back-office", () => {
  it("cherche par nom, matière ou référence de taille, et filtre par statut et stock", async () => {
    const created = await createProduct(db, DRESS);
    expect((await listProductsForAdmin(db, { q: "robe lin" })).rows.map((row) => row.product.id)).toEqual([created.id]);
    expect((await listProductsForAdmin(db, { q: "rb-01-m" })).rows.map((row) => row.product.id)).toEqual([created.id]);
    expect((await listProductsForAdmin(db, { q: "lin", status: "archives" })).total).toBe(0);
    expect((await listProductsForAdmin(db, { stock: "bas" })).rows.map((row) => row.product.id)).toContain(created.id);
    await setStock(db, BAG, 0);
    const out = await listProductsForAdmin(db, { stock: "rupture" });
    expect(out.rows.map((row) => row.product.slug)).toContain(BAG);
    expect(out.rows.every((row) => row.stock <= 0)).toBe(true);
  });

  it("pagine", async () => {
    const all = await listProductsForAdmin(db);
    expect(all.total).toBeGreaterThan(1);
    expect(all.rows.length).toBe(all.total);
  });
});

describe("dupliquer", () => {
  it("copie textes, photos et tailles, hors vente et stock à zéro", async () => {
    const created = await createProduct(db, DRESS);
    const copy = await duplicateProduct(db, created.id);
    expect(copy).toMatchObject({ name: "Robe portefeuille, lin bleu (copie)", active: false, sku: null, imageUrl: "/assets/robe.jpeg", gallery: ["/assets/robe-dos.jpeg"] });
    expect(copy!.slug).not.toBe(created.slug);
    const full = await getProductForAdmin(db, copy!.id);
    expect(full!.variants.map((variant) => [variant.size, variant.stock, variant.sku])).toEqual([
      ["S", 0, null],
      ["M", 0, null],
    ]);
    const [original] = await db.select().from(products).where(eq(products.id, created.id));
    expect(original.active).toBe(true);
  });

  it("renvoie undefined pour un produit inconnu", async () => {
    expect(await duplicateProduct(db, 999_999)).toBeUndefined();
  });
});

describe("résumé des modifications (journal)", () => {
  it("nomme les champs changés et les mouvements de stock", async () => {
    const created = await createProduct(db, DRESS);
    const before = await getProductForAdmin(db, created.id);
    const [small, medium] = before!.variants;
    const changes = describeProductChanges(before!, {
      ...DRESS,
      priceCents: 22000,
      gallery: [],
      variants: [{ id: small.id, size: "S", color: "", sku: null, stock: 3, originalStock: 2 }],
    });
    expect(changes).toEqual(["prix", "photos", "Taille S 2 → 3", `retrait Taille M`]);
    void medium;
  });
});

describe("photos envoyées", () => {
  it("reconnaît JPEG, PNG et WebP par leurs premiers octets, rien d'autre", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageType(new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("image/webp");
    expect(detectImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });
});
