import type { Metadata } from "next";

import { ProductForm } from "@/components/ProductForm";
import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { listCategories } from "@/server/catalog";
import { requireStaff } from "@/server/guard";

export const metadata: Metadata = { title: "Nouveau produit" };

export default async function NewProductPage() {
  await requireStaff();
  const categories = await listCategories(await getDb());

  return (
    <>
      <h1>Nouveau produit</h1>
      <div className="form-narrow" style={{ maxWidth: "40rem" }}>
        <ProductForm
          categories={categories.map((category) => ({ id: category.id, name: category.name, family: category.family }))}
          currencyCode={store.currency.code}
          exponent={store.currency.exponent}
          initial={{
            name: "",
            slug: "",
            summary: "",
            description: "",
            categoryId: "",
            price: "",
            compareAt: "",
            active: true,
            department: "femme",
            condition: "neuf",
            wearGrade: "",
            defects: "",
            material: "",
            tone: "t1",
            imageUrl: "",
            gallery: "",
            sku: "",
            variants: [{ size: "", color: "", stock: "1", sku: "" }],
          }}
        />
      </div>
    </>
  );
}
