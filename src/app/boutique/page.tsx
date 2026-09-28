import type { Metadata } from "next";
import Link from "next/link";

import { ProductTile } from "@/components/ProductTile";
import { getDb } from "@/db/client";
import { SORTS, countByCategory, getCategoryBySlug, listCategories, listProducts } from "@/server/catalog";
import type { Sort } from "@/server/catalog";
import { getDisplayCurrency } from "@/server/context";

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

const SORT_LABELS: Record<Sort, string> = {
  recent: "Nouveautés",
  "price-asc": "Prix croissant",
  "price-desc": "Prix décroissant",
  name: "Nom (A–Z)",
};

export async function generateMetadata({ searchParams }: PageProps<"/boutique">): Promise<Metadata> {
  const params: Params = await searchParams;
  const filtered = ["q", "tri", "page", "dispo", "categorie"].some((key) => first(params[key]) !== "");
  return {
    title: "Boutique",
    description: "Tous les produits, filtrables par rayon, prix ou disponibilité.",
    alternates: { canonical: "/boutique" },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ searchParams }: PageProps<"/boutique">) {
  const params: Params = await searchParams;
  const categorySlug = first(params.categorie);
  const q = first(params.q);
  const sortParam = first(params.tri);
  const sort = (SORTS as readonly string[]).includes(sortParam) ? (sortParam as Sort) : "recent";
  const inStockOnly = first(params.dispo) === "1";
  const pageNumber = Number.parseInt(first(params.page), 10) || 1;

  const db = await getDb();
  const [categories, counts, activeCategory, currency] = await Promise.all([
    listCategories(db),
    countByCategory(db),
    categorySlug ? getCategoryBySlug(db, categorySlug) : Promise.resolve(undefined),
    getDisplayCurrency(),
  ]);
  const result = await listProducts(db, { category: activeCategory?.slug, q, sort, inStockOnly, page: pageNumber });

  function href(overrides: Params): string {
    const query = new URLSearchParams();
    const merged: Params = {
      categorie: activeCategory?.slug,
      q,
      tri: sort === "recent" ? "" : sort,
      dispo: inStockOnly ? "1" : "",
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      const text = first(value);
      if (text) query.set(key, text);
    }
    const suffix = query.toString();
    return suffix ? `/boutique?${suffix}` : "/boutique";
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Catalogue</p>
          <h1>{activeCategory ? activeCategory.name : q ? `Résultats pour « ${q} »` : "Tous les produits"}</h1>
        </div>
        {activeCategory?.description && (
          <p className="muted" style={{ maxWidth: "36ch", margin: 0 }}>
            {activeCategory.description}
          </p>
        )}
      </div>

      <div className="catalog">
        <aside className="rail" aria-label="Rayons">
          <h2>Rayons</h2>
          <ul>
            <li>
              <Link href={href({ categorie: "", page: "" })} aria-current={!activeCategory ? "page" : undefined}>
                <span>Tout</span>
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  href={href({ categorie: category.slug, page: "" })}
                  aria-current={activeCategory?.id === category.id ? "page" : undefined}
                >
                  <span>{category.name}</span>
                  <span className="count">{counts.get(category.id) ?? 0}</span>
                </Link>
              </li>
            ))}
          </ul>
        </aside>

        <section aria-label="Produits">
          <form method="get" action="/boutique" className="toolbar">
            {activeCategory && <input type="hidden" name="categorie" value={activeCategory.slug} />}
            <div className="field" style={{ flex: "1 1 14rem" }}>
              <label htmlFor="q">Rechercher</label>
              <input id="q" type="search" name="q" defaultValue={q} placeholder="Nom, matière, usage…" />
            </div>
            <div className="field">
              <label htmlFor="tri">Trier par</label>
              <select id="tri" name="tri" defaultValue={sort}>
                {SORTS.map((value) => (
                  <option key={value} value={value}>
                    {SORT_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>
                <input type="checkbox" name="dispo" value="1" defaultChecked={inStockOnly} /> En stock seulement
              </label>
            </div>
            <button type="submit" className="button button-quiet">
              Appliquer
            </button>
          </form>

          <p className="result-count" role="status">
            {result.total} produit{result.total > 1 ? "s" : ""}
          </p>

          {result.items.length === 0 ? (
            <div className="empty">
              <p>Aucun produit ne correspond à cette recherche.</p>
              <Link href="/boutique">Voir tout le catalogue</Link>
            </div>
          ) : (
            <ul className="grid">
              {result.items.map((product, index) => (
                <ProductTile key={product.id} product={product} currency={currency} index={(result.page - 1) * result.pageSize + index + 1} />
              ))}
            </ul>
          )}

          {result.pageCount > 1 && (
            <nav className="pagination" aria-label="Pagination">
              {result.page > 1 ? <Link href={href({ page: String(result.page - 1) })}>← Précédent</Link> : <span />}
              <span>
                Page {result.page} sur {result.pageCount}
              </span>
              {result.page < result.pageCount ? <Link href={href({ page: String(result.page + 1) })}>Suivant →</Link> : <span />}
            </nav>
          )}
        </section>
      </div>
    </>
  );
}
