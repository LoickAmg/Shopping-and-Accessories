import type { Metadata } from "next";

import { deleteCategoryAction } from "@/app/actions/admin";
import { CategoryForm } from "@/components/CategoryForm";
import { getDb } from "@/db/client";
import { countByCategory, listCategories } from "@/server/catalog";

export const metadata: Metadata = { title: "Rayons" };

export default async function AdminCategoriesPage({ searchParams }: PageProps<"/admin/categories">) {
  const query = await searchParams;
  const db = await getDb();
  const [categories, counts] = await Promise.all([listCategories(db), countByCategory(db)]);

  return (
    <>
      <h1>Rayons</h1>
      {query.enregistre && (
        <p className="notice notice-ok" role="status">
          Rayon enregistré.
        </p>
      )}

      <div className="two-col">
        <section aria-labelledby="existing">
          <h2 id="existing">Rayons existants</h2>
          <ul className="lines">
            {categories.map((category) => (
              <li key={category.id} className="stack" style={{ padding: "var(--space-4) 0", borderBottom: "1px solid var(--rule)" }}>
                <p className="muted small" style={{ margin: 0 }}>
                  {counts.get(category.id) ?? 0} produit(s) en vente
                </p>
                <CategoryForm initial={{ id: category.id, name: category.name, description: category.description, position: category.position }} />
                <form action={deleteCategoryAction}>
                  <input type="hidden" name="id" value={category.id} />
                  <button type="submit" className="link-button">
                    Supprimer ce rayon
                  </button>
                  <span className="muted small"> Les produits restent au catalogue, sans rayon.</span>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <aside className="summary" aria-labelledby="add-category">
          <h2 id="add-category">Nouveau rayon</h2>
          <CategoryForm initial={{ name: "", description: "", position: categories.length }} />
        </aside>
      </div>
    </>
  );
}
