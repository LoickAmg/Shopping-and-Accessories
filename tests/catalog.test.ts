import { beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import { getCategoryBySlug, getProductBySlug, listCategories, listProducts, listRelated } from "@/server/catalog";

import { createTestDb } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createTestDb({ seeded: true });
});

describe("catalogue", () => {
  it("liste les catégories dans l'ordre voulu", async () => {
    const categories = await listCategories(db);
    expect(categories.map((category) => category.slug)).toEqual(["sacs-a-main", "cabas", "sacs-d-epaule"]);
  });

  it("pagine les produits actifs", async () => {
    const first = await listProducts(db, { pageSize: 5 });
    expect(first.total).toBe(8);
    expect(first.items).toHaveLength(5);
    expect(first.pageCount).toBe(2);

    const last = await listProducts(db, { pageSize: 5, page: 99 });
    expect(last.page).toBe(2);
    expect(last.items).toHaveLength(3);
  });

  it("filtre par catégorie", async () => {
    const page = await listProducts(db, { category: "cabas" });
    expect(page.total).toBe(3);
    expect(page.items.every((item) => item.categorySlug === "cabas")).toBe(true);
  });

  it("cherche sans tenir compte des accents ni de la casse", async () => {
    const page = await listProducts(db, { q: "TRAPEZE" });
    expect(page.items.map((item) => item.slug)).toEqual(["sac-trapeze-croco-bleu-nuit"]);
    expect((await listProducts(db, { q: "médaillon" })).total).toBe(1);
  });

  it("traite les jokers de LIKE comme du texte", async () => {
    expect((await listProducts(db, { q: "%" })).total).toBe(0);
    expect((await listProducts(db, { q: "_" })).total).toBe(0);
  });

  it("trie par prix et par nom", async () => {
    const asc = await listProducts(db, { sort: "price-asc", pageSize: 60 });
    const prices = asc.items.map((item) => item.priceCents);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));

    const byName = await listProducts(db, { sort: "name", pageSize: 60 });
    const names = byName.items.map((item) => item.name);
    expect(names).toEqual([...names].sort());
  });

  it("masque les produits en rupture quand on le demande", async () => {
    const all = await listProducts(db, { pageSize: 60 });
    const inStock = await listProducts(db, { pageSize: 60, inStockOnly: true });
    expect(all.total - inStock.total).toBe(1);
    expect(inStock.items.every((item) => item.stock > 0)).toBe(true);
  });

  it("renvoie une fiche produit avec sa catégorie", async () => {
    const product = await getProductBySlug(db, "sac-trapeze-croco-bleu-nuit");
    expect(product?.categoryName).toBe("Sacs à main");
    expect(product?.compareAtCents).toBeGreaterThan(product?.priceCents ?? 0);
    expect(await getProductBySlug(db, "n-existe-pas")).toBeUndefined();
  });

  it("propose des produits liés de la même catégorie, sans le produit lui-même", async () => {
    const product = await getProductBySlug(db, "sac-trapeze-croco-bleu-nuit");
    const related = await listRelated(db, product!);
    expect(related.length).toBeGreaterThan(0);
    expect(related.every((item) => item.slug !== "sac-trapeze-croco-bleu-nuit" && item.categorySlug === "sacs-a-main")).toBe(true);
  });

  it("retrouve une catégorie par son identifiant d'URL", async () => {
    expect((await getCategoryBySlug(db, "sacs-a-main"))?.name).toBe("Sacs à main");
    expect(await getCategoryBySlug(db, "inconnue")).toBeUndefined();
  });
});
