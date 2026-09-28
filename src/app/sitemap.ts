import type { MetadataRoute } from "next";

import { getDb } from "@/db/client";
import { siteUrl } from "@/payments/registry";
import { listCategories, listProducts } from "@/server/catalog";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const at = (path: string) => new URL(path, base).toString();
  const db = await getDb();
  const [categories, products] = await Promise.all([listCategories(db), listProducts(db, { pageSize: 60 })]);

  return [
    { url: at("/") },
    { url: at("/boutique") },
    ...categories.map((category) => ({ url: at(`/boutique?categorie=${category.slug}`) })),
    ...products.items.map((product) => ({ url: at(`/produit/${product.slug}`), lastModified: product.updatedAt })),
    { url: at("/a-propos") },
    { url: at("/livraison-retours") },
    { url: at("/cgv") },
    { url: at("/mentions-legales") },
    { url: at("/confidentialite") },
    { url: at("/contact") },
  ];
}
