import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import { categories, productVariants } from "@/db/schema";
import { parseVariantRows } from "@/lib/variant-form";
import { InvalidVariantsError, createProduct, getProductForAdmin, updateProduct } from "@/server/admin";
import type { ProductInput } from "@/server/admin";
import { UnavailableProductError, addToCart, getCartView } from "@/server/cart";
import { getProductBySlug, listAvailableSizes, listProducts, sortSizes } from "@/server/catalog";
import { OutOfStockError, createOrder } from "@/server/orders";

import { createTestDb, resetDb } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetDb(db, { seeded: true });
});

async function categoryId(slug: string): Promise<number> {
  const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  return row.id;
}

async function dress(overrides: Partial<ProductInput> = {}): Promise<ProductInput> {
  return {
    name: "Robe portefeuille, lin bleu",
    summary: "Lin lavé, ceinture à nouer.",
    description: "Une robe fluide pour les journées chaudes.",
    categoryId: await categoryId("robes-jupes"),
    priceCents: 18000,
    compareAtCents: null,
    active: true,
    department: "femme",
    condition: "neuf",
    wearGrade: null,
    defects: "",
    material: "Lin",
    tone: "t2",
    imageUrl: "/assets/robe.jpeg",
    gallery: [],
    sku: null,
    variants: [
      { size: "S", color: "", sku: null, stock: 2 },
      { size: "M", color: "", sku: null, stock: 0 },
      { size: "L", color: "", sku: null, stock: 4 },
    ],
    ...overrides,
  };
}

async function variantBySize(productSlug: string, size: string) {
  const product = await getProductBySlug(db, productSlug);
  const variant = product?.variants.find((item) => item.size === size);
  if (!variant) throw new Error(`Taille ${size} introuvable`);
  return variant;
}

function checkout(cartId: string) {
  return createOrder(db, {
    cartId,
    userId: null,
    email: "client@exemple.test",
    customerName: "Client",
    address: { line1: "1 rue A", postalCode: "1", city: "Cotonou", country: "BJ" },
    paymentProvider: "demo",
    currency: "XOF",
    shipping: { flatCents: 2000, freeOverCents: 0 },
    reservationMinutes: 30,
  });
}

describe("produits à tailles", () => {
  it("affiche une seule fiche avec ses tailles, et le stock total", async () => {
    const created = await createProduct(db, await dress());
    const product = await getProductBySlug(db, created.slug);
    expect(product?.variants.map((variant) => variant.size)).toEqual(["S", "M", "L"]);
    expect(product?.stock).toBe(6);
    expect(product?.singleVariantId).toBeNull();
  });

  it("refuse d'ajouter une taille épuisée, accepte une taille en stock", async () => {
    const created = await createProduct(db, await dress());
    const m = await variantBySize(created.slug, "M");
    const s = await variantBySize(created.slug, "S");
    await expect(addToCart(db, { variantId: m.id, quantity: 1 })).rejects.toBeInstanceOf(UnavailableProductError);
    const { cartId, quantity } = await addToCart(db, { variantId: s.id, quantity: 5 });
    expect(quantity).toBe(2); // plafonné au stock de la taille S
    const cart = await getCartView(db, cartId);
    expect(cart.lines[0].variantLabel).toBe("Taille S");
  });

  it("refuse la taille d'un autre produit glissée dans le formulaire", async () => {
    const created = await createProduct(db, await dress());
    const s = await variantBySize(created.slug, "S");
    const bag = await getProductBySlug(db, "cabas-double-soufflet-noir");
    await expect(addToCart(db, { variantId: s.id, productId: bag!.id, quantity: 1 })).rejects.toBeInstanceOf(UnavailableProductError);
  });

  it("réserve le stock taille par taille, sans jamais vendre deux fois la dernière pièce", async () => {
    const created = await createProduct(db, await dress());
    const s = await variantBySize(created.slug, "S");
    const first = await addToCart(db, { variantId: s.id, quantity: 2 });
    const second = await addToCart(db, { variantId: s.id, quantity: 1 });

    const order = await checkout(first.cartId);
    expect(order.items[0]).toMatchObject({ variantLabel: "Taille S", quantity: 2 });
    expect((await variantBySize(created.slug, "S")).stock).toBe(0);
    expect((await variantBySize(created.slug, "L")).stock).toBe(4); // les autres tailles ne bougent pas

    await expect(checkout(second.cartId)).rejects.toBeInstanceOf(OutOfStockError);
  });
});

describe("édition des déclinaisons", () => {
  it("désactive une taille retirée sans la supprimer, et la réactive si elle revient", async () => {
    const created = await createProduct(db, await dress());
    const before = await getProductForAdmin(db, created.id);
    const withoutM = before!.variants.filter((variant) => variant.size !== "M").map((variant) => ({ ...variant, sku: variant.sku }));
    await updateProduct(db, created.id, await dress({ variants: withoutM }));

    const rows = await db.select().from(productVariants).where(eq(productVariants.productId, created.id));
    expect(rows).toHaveLength(3); // rien n'est supprimé
    expect(rows.find((row) => row.size === "M")?.active).toBe(false);
    expect((await getProductBySlug(db, created.slug))?.variants.map((variant) => variant.size)).toEqual(["S", "L"]);

    await updateProduct(db, created.id, await dress({ variants: [...withoutM, { size: "M", color: "", sku: null, stock: 3 }] }));
    const m = (await db.select().from(productVariants).where(eq(productVariants.productId, created.id))).filter((row) => row.size === "M");
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ active: true, stock: 3 });
  });

  it("refuse une fiche sans déclinaison ou avec une taille en double", async () => {
    await expect(createProduct(db, await dress({ variants: [] }))).rejects.toBeInstanceOf(InvalidVariantsError);
    const doubled = [
      { size: "M", color: "", sku: null, stock: 1 },
      { size: "m", color: "", sku: null, stock: 2 },
    ];
    await expect(createProduct(db, await dress({ variants: doubled }))).rejects.toBeInstanceOf(InvalidVariantsError);
  });
});

describe("friperie et fin de série", () => {
  it("garde l'état d'usure et les défauts d'une pièce de seconde main, et les efface si elle repasse en neuf", async () => {
    const piece = await dress({
      name: "Veste en jean vintage",
      condition: "seconde_main",
      wearGrade: "tres_bon",
      defects: "Légère décoloration au col.",
      variants: [{ size: "M", color: "", sku: null, stock: 1 }],
    });
    const created = await createProduct(db, piece);
    const stored = await getProductForAdmin(db, created.id);
    expect(stored).toMatchObject({ condition: "seconde_main", wearGrade: "tres_bon", defects: "Légère décoloration au col." });

    await updateProduct(db, created.id, { ...piece, condition: "neuf" });
    expect(await getProductForAdmin(db, created.id)).toMatchObject({ condition: "neuf", wearGrade: null, defects: "" });
  });
});

describe("filtres de la boutique", () => {
  it("filtre par univers, état, taille disponible et famille de rayons", async () => {
    await createProduct(db, await dress());
    await createProduct(
      db,
      await dress({
        name: "Chemise oxford homme",
        department: "homme",
        condition: "fin_de_serie",
        categoryId: await categoryId("hauts-chemises"),
        variants: [{ size: "XL", color: "Écru", sku: null, stock: 1 }],
      }),
    );

    expect((await listProducts(db, { department: "homme" })).items.map((item) => item.name)).toEqual(["Chemise oxford homme"]);
    expect((await listProducts(db, { condition: "fin_de_serie" })).total).toBe(1);
    expect((await listProducts(db, { size: "L" })).items.map((item) => item.name)).toEqual(["Robe portefeuille, lin bleu"]);
    expect((await listProducts(db, { size: "M" })).total).toBe(0); // la taille M est épuisée
    expect((await listProducts(db, { family: "vetements" })).total).toBe(2);
    expect((await listProducts(db, { family: "sacs" })).total).toBe(8);
    expect((await listProducts(db, { q: "ecru" })).items.map((item) => item.name)).toEqual(["Chemise oxford homme"]); // couleur cherchable, sans accent
    expect(await listAvailableSizes(db)).toEqual(["S", "L", "XL"]);
  });

  it("classe les tailles dans l'ordre naturel", () => {
    expect(sortSizes(["XL", "10 ans", "M", "2 ans", "S", "54", "XS", "Unique"])).toEqual(["XS", "S", "M", "XL", "2 ans", "10 ans", "54", "Unique"]);
  });
});

describe("lecture du formulaire de déclinaisons", () => {
  it("lit les lignes, ignore les lignes vides et garde l'identifiant existant", () => {
    const { variants, error } = parseVariantRows({
      variant_id_0: "12",
      variant_size_0: " M ",
      variant_stock_0: "3",
      variant_size_1: "",
      variant_color_1: "",
      variant_stock_1: "",
      variant_size_2: "L",
      variant_color_2: "Noir",
      variant_stock_2: "0",
      variant_sku_2: "ROBE-L-N",
    });
    expect(error).toBeUndefined();
    expect(variants).toEqual([
      { id: 12, size: "M", color: "", sku: null, stock: 3 },
      { id: undefined, size: "L", color: "Noir", sku: "ROBE-L-N", stock: 0 },
    ]);
  });

  it("refuse un stock qui n'est pas un entier positif", () => {
    for (const bad of ["-1", "2.5", "abc", ""]) {
      const { error } = parseVariantRows({ variant_size_0: "M", variant_stock_0: bad });
      expect(error, bad).toBeDefined();
    }
  });
});
