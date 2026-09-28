import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductForm } from "@/components/ProductForm";
import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { minorToInput } from "@/lib/money";
import { getProductForAdmin } from "@/server/admin";
import { listCategories } from "@/server/catalog";

export const metadata: Metadata = { title: "Modifier le produit" };

export default async function EditProductPage({ params }: PageProps<"/admin/produits/[id]">) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) notFound();

  const db = await getDb();
  const [product, categories] = await Promise.all([getProductForAdmin(db, productId), listCategories(db)]);
  if (!product) notFound();
  const exponent = store.currency.exponent;

  return (
    <>
      <h1>{product.name}</h1>
      <div className="form-narrow" style={{ maxWidth: "40rem" }}>
        <ProductForm
          categories={categories.map((category) => ({ id: category.id, name: category.name }))}
          currencyCode={store.currency.code}
          exponent={exponent}
          initial={{
            id: product.id,
            name: product.name,
            slug: product.slug,
            summary: product.summary,
            description: product.description,
            categoryId: product.categoryId == null ? "" : String(product.categoryId),
            price: minorToInput(product.priceCents, exponent),
            compareAt: product.compareAtCents == null ? "" : minorToInput(product.compareAtCents, exponent),
            stock: String(product.stock),
            active: product.active,
            tone: product.tone,
            imageUrl: product.imageUrl ?? "",
            sku: product.sku ?? "",
          }}
        />
      </div>
    </>
  );
}
