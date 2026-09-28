import type { Metadata } from "next";

import { ProductForm } from "@/components/ProductForm";
import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { listCategories } from "@/server/catalog";

export const metadata: Metadata = { title: "Nouveau produit" };

export default async function NewProductPage() {
  const categories = await listCategories(await getDb());

  return (
    <>
      <h1>Nouveau produit</h1>
      <div className="form-narrow" style={{ maxWidth: "40rem" }}>
        <ProductForm
          categories={categories.map((category) => ({ id: category.id, name: category.name }))}
          currencyCode={store.currency.code}
          exponent={store.currency.exponent}
          initial={{ name: "", slug: "", summary: "", description: "", categoryId: "", price: "", compareAt: "", stock: "0", active: true, tone: "t1", imageUrl: "", sku: "" }}
        />
      </div>
    </>
  );
}
