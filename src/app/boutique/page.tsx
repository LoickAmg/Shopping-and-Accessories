import type { Metadata } from "next";
import Link from "next/link";

import { ProductTile } from "@/components/ProductTile";
import { getDb } from "@/db/client";
import { CATEGORY_FAMILIES, CONDITIONS, DEPARTMENTS } from "@/db/schema";
import type { CategoryFamily, Condition, Department } from "@/db/schema";
import { CONDITION_LABELS, DEPARTMENT_LABELS, FAMILY_LABELS } from "@/lib/taxonomy";
import { SORTS, countByCategory, getCategoryBySlug, listAvailableSizes, listCategories, listProducts } from "@/server/catalog";
import type { Sort } from "@/server/catalog";
import { getDisplayCurrency } from "@/server/context";

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** N'accepte qu'une valeur de la liste connue : un paramètre d'URL inconnu est simplement ignoré. */
function oneOf<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

const SORT_LABELS: Record<Sort, string> = {
  recent: "Nouveautés",
  "price-asc": "Prix croissant",
  "price-desc": "Prix décroissant",
  name: "Nom (A–Z)",
};

export async function generateMetadata({ searchParams }: PageProps<"/boutique">): Promise<Metadata> {
  const params: Params = await searchParams;
  const filtered = ["q", "tri", "page", "dispo", "categorie", "univers", "famille", "etat", "taille"].some((key) => first(params[key]) !== "");
  const department = oneOf(first(params.univers), DEPARTMENTS);
  const family = oneOf(first(params.famille), CATEGORY_FAMILIES);
  const condition = oneOf(first(params.etat), CONDITIONS);
  const title = condition ? CONDITION_LABELS[condition] : family ? FAMILY_LABELS[family] : department ? DEPARTMENT_LABELS[department] : "Boutique";
  return {
    title,
    description: "Vêtements femme, homme et enfant, friperie, fin de série, sacs et bijoux.",
    alternates: { canonical: "/boutique" },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ searchParams }: PageProps<"/boutique">) {
  const params: Params = await searchParams;
  const categorySlug = first(params.categorie);
  const q = first(params.q);
  const sort = oneOf(first(params.tri), SORTS) ?? "recent";
  const inStockOnly = first(params.dispo) === "1";
  const department = oneOf<Department>(first(params.univers), DEPARTMENTS);
  const family = oneOf<CategoryFamily>(first(params.famille), CATEGORY_FAMILIES);
  const condition = oneOf<Condition>(first(params.etat), CONDITIONS);
  const sizeParam = first(params.taille).slice(0, 30);
  const pageNumber = Number.parseInt(first(params.page), 10) || 1;

  const db = await getDb();
  const [categories, counts, activeCategory, currency, sizes] = await Promise.all([
    listCategories(db),
    countByCategory(db),
    categorySlug ? getCategoryBySlug(db, categorySlug) : Promise.resolve(undefined),
    getDisplayCurrency(),
    listAvailableSizes(db),
  ]);
  // Une taille demandée est toujours appliquée, même épuisée : on affiche « aucun produit » plutôt que tout le catalogue.
  const size = sizeParam.trim() || undefined;
  const sizeOptions = size && !sizes.includes(size) ? [...sizes, size] : sizes;
  // Pour un visiteur, les bijoux sont des accessoires : « Accessoires » les inclut.
  const familyFilter = family === "accessoires" ? (["accessoires", "bijoux"] as CategoryFamily[]) : family;
  const result = await listProducts(db, {
    category: activeCategory?.slug,
    family: familyFilter,
    department,
    condition,
    size,
    q,
    sort,
    inStockOnly,
    page: pageNumber,
  });

  function href(overrides: Params): string {
    const query = new URLSearchParams();
    const merged: Params = {
      categorie: activeCategory?.slug,
      univers: department,
      famille: family,
      etat: condition,
      taille: size,
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

  const heading = activeCategory
    ? activeCategory.name
    : q
      ? `Résultats pour « ${q} »`
      : condition
        ? CONDITION_LABELS[condition]
        : family
          ? FAMILY_LABELS[family]
          : department
            ? DEPARTMENT_LABELS[department]
            : "Tous les produits";
  const eyebrow = [department && (activeCategory || condition || family) ? DEPARTMENT_LABELS[department] : null, "Catalogue"].filter(Boolean).join(" · ");
  const families = CATEGORY_FAMILIES.filter((item) => categories.some((category) => category.family === item));
  const activeFilters = [
    department && { label: DEPARTMENT_LABELS[department], clear: href({ univers: "", page: "" }) },
    family && { label: FAMILY_LABELS[family], clear: href({ famille: "", page: "" }) },
    condition && { label: CONDITION_LABELS[condition], clear: href({ etat: "", page: "" }) },
    size && { label: `Taille ${size}`, clear: href({ taille: "", page: "" }) },
  ].filter((item): item is { label: string; clear: string } => Boolean(item));

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{heading}</h1>
        </div>
        {activeCategory?.description && (
          <p className="muted" style={{ maxWidth: "36ch", margin: 0 }}>
            {activeCategory.description}
          </p>
        )}
      </div>

      <nav className="universe-tabs" aria-label="Univers">
        <Link href={href({ univers: "", page: "" })} aria-current={!department ? "page" : undefined}>
          Tout
        </Link>
        {DEPARTMENTS.map((item) => (
          <Link key={item} href={href({ univers: item, page: "" })} aria-current={department === item ? "page" : undefined}>
            {DEPARTMENT_LABELS[item]}
          </Link>
        ))}
      </nav>

      <div className="catalog">
        <aside className="rail" aria-label="Rayons">
          <h2>Rayons</h2>
          <ul>
            <li>
              <Link href={href({ categorie: "", famille: "", page: "" })} aria-current={!activeCategory && !family ? "page" : undefined}>
                <span>Tout</span>
              </Link>
            </li>
          </ul>
          {families.map((item) => (
            <div key={item}>
              <h3 className="rail-family">
                <Link href={href({ famille: item, categorie: "", page: "" })} aria-current={family === item && !activeCategory ? "page" : undefined}>
                  {FAMILY_LABELS[item]}
                </Link>
              </h3>
              <ul>
                {categories
                  .filter((category) => category.family === item)
                  .map((category) => (
                    <li key={category.id}>
                      <Link
                        href={href({ categorie: category.slug, famille: "", page: "" })}
                        aria-current={activeCategory?.id === category.id ? "page" : undefined}
                      >
                        <span>{category.name}</span>
                        <span className="count">{counts.get(category.id) ?? 0}</span>
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <h2>Sélections</h2>
          <ul>
            <li>
              <Link href={href({ etat: "seconde_main", page: "" })} aria-current={condition === "seconde_main" ? "page" : undefined}>
                <span>Friperie</span>
              </Link>
            </li>
            <li>
              <Link href={href({ etat: "fin_de_serie", page: "" })} aria-current={condition === "fin_de_serie" ? "page" : undefined}>
                <span>Fin de série</span>
              </Link>
            </li>
          </ul>
        </aside>

        <section aria-label="Produits">
          <form method="get" action="/boutique" className="toolbar">
            {activeCategory && <input type="hidden" name="categorie" value={activeCategory.slug} />}
            {family && <input type="hidden" name="famille" value={family} />}
            {department && <input type="hidden" name="univers" value={department} />}
            <div className="field" style={{ flex: "1 1 14rem" }}>
              <label htmlFor="q">Rechercher</label>
              <input id="q" type="search" name="q" defaultValue={q} placeholder="Nom, matière, couleur…" />
            </div>
            <div className="field">
              <label htmlFor="etat">État</label>
              <select id="etat" name="etat" defaultValue={condition ?? ""}>
                <option value="">Tous</option>
                {CONDITIONS.map((item) => (
                  <option key={item} value={item}>
                    {CONDITION_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>
            {sizeOptions.length > 0 && (
              <div className="field">
                <label htmlFor="taille">Taille</label>
                <select id="taille" name="taille" defaultValue={size ?? ""}>
                  <option value="">Toutes</option>
                  {sizeOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            )}
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

          {activeFilters.length > 0 && (
            <ul className="filter-chips" aria-label="Filtres actifs">
              {activeFilters.map((filter) => (
                <li key={filter.label}>
                  <Link href={filter.clear} aria-label={`Retirer le filtre ${filter.label}`}>
                    {filter.label} <span aria-hidden="true">×</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="result-count" role="status">
            {result.total} produit{result.total > 1 ? "s" : ""}
          </p>

          {result.items.length === 0 ? (
            <div className="empty">
              <p>Aucun produit ne correspond à cette sélection pour le moment.</p>
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
