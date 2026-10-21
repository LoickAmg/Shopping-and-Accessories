import type { Metadata } from "next";
import Link from "next/link";

import { duplicateProductAction, toggleProductAction } from "@/app/actions/admin";
import { AdminPager, currentPath, pageParam, param } from "@/components/AdminPager";
import { CatalogueImportExport } from "@/components/CatalogueImportExport";
import { getDb } from "@/db/client";
import { money } from "@/lib/format";
import { CONDITION_LABELS } from "@/lib/taxonomy";
import { ADMIN_PRODUCTS_PAGE_SIZE, listProductsForAdmin } from "@/server/admin";
import type { AdminProductFilter } from "@/server/admin";
import { listCategories } from "@/server/catalog";
import { requireStaff } from "@/server/guard";

export const metadata: Metadata = { title: "Produits" };

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/produits">) {
  await requireStaff();
  const query = await searchParams;
  const q = param(query.q).trim().slice(0, 80);
  const rayon = param(query.rayon);
  const statut = param(query.statut);
  const stock = param(query.stock);
  const page = pageParam(query.page);

  const filter: AdminProductFilter = {
    q,
    categoryId: rayon === "aucun" ? "aucun" : Number(rayon) > 0 ? Number(rayon) : undefined,
    status: statut === "en-vente" || statut === "archives" ? statut : undefined,
    stock: stock === "rupture" || stock === "bas" ? stock : undefined,
    page,
  };
  const db = await getDb();
  const [{ rows, total }, categories] = await Promise.all([listProductsForAdmin(db, filter), listCategories(db)]);
  const filters = { q, rayon, statut, stock };
  const here = currentPath("/admin/produits", filters, page);
  const filtered = Boolean(q || rayon || statut || stock);

  return (
    <>
      <div className="page-head">
        <h1>Produits</h1>
        <div className="actions">
          <CatalogueImportExport exportHref={`/api/admin/catalogue/export?${new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as [string, string][]).toString()}`} />
          <Link href="/admin/produits/nouveau" className="button">
            Nouveau produit
          </Link>
        </div>
      </div>

      {query.enregistre && (
        <p className="notice notice-ok" role="status">
          Produit enregistré.
        </p>
      )}

      <form className="admin-filters" role="search" action="/admin/produits">
        <div className="field admin-filters-search">
          <label htmlFor="q">Rechercher</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nom, matière, couleur, référence…" />
        </div>
        <div className="field">
          <label htmlFor="rayon">Rayon</label>
          <select id="rayon" name="rayon" defaultValue={rayon}>
            <option value="">Tous</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
            <option value="aucun">Sans rayon</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="statut">Statut</label>
          <select id="statut" name="statut" defaultValue={statut}>
            <option value="">Tous</option>
            <option value="en-vente">En vente</option>
            <option value="archives">Archivés</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="stock">Stock</label>
          <select id="stock" name="stock" defaultValue={stock}>
            <option value="">Tous</option>
            <option value="bas">Stock bas</option>
            <option value="rupture">En rupture</option>
          </select>
        </div>
        <div className="admin-filters-actions">
          <button type="submit" className="button button-small">
            Filtrer
          </button>
          {filtered && (
            <Link href="/admin/produits" className="small">
              Effacer
            </Link>
          )}
        </div>
      </form>

      <p className="muted small" role="status">
        {total} produit{total > 1 ? "s" : ""}
        {filtered ? ` trouvé${total > 1 ? "s" : ""}` : ""}
      </p>

      {rows.length === 0 ? (
        <p className="empty">Aucun produit ne correspond.</p>
      ) : (
        <div className="table-wrap">
          <table className="admin-products">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Photo</span>
                </th>
                <th scope="col">Produit</th>
                <th scope="col">Rayon</th>
                <th scope="col" className="num">
                  Prix
                </th>
                <th scope="col" className="num">
                  Stock
                </th>
                <th scope="col">Statut</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product, stock: units, categoryName }) => (
                <tr key={product.id} className={product.active ? undefined : "is-archived"}>
                  <td className="admin-thumb">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.imageUrl} alt="" loading="lazy" width={48} height={64} />
                    ) : (
                      <span aria-hidden="true">{product.name.charAt(0)}</span>
                    )}
                  </td>
                  <td>
                    <Link href={`/admin/produits/${product.id}`}>{product.name}</Link>
                    {product.condition !== "neuf" && <span className="muted small"> · {CONDITION_LABELS[product.condition]}</span>}
                    {product.sku && <span className="muted small"> · {product.sku}</span>}
                  </td>
                  <td>{categoryName ?? "—"}</td>
                  <td className="num">{money(product.priceCents)}</td>
                  <td className="num">
                    <Link href={`/admin/stock?produit=${product.id}`} className={units <= 0 ? "stock-out" : undefined} title="Modifier le stock">
                      {units}
                    </Link>
                  </td>
                  <td>{product.active ? "En vente" : "Archivé"}</td>
                  <td>
                    <div className="row-actions">
                      <Link href={`/admin/produits/${product.id}`}>Modifier</Link>
                      <form action={duplicateProductAction}>
                        <input type="hidden" name="id" value={product.id} />
                        <button type="submit" className="link-button">
                          Dupliquer
                        </button>
                      </form>
                      <form action={toggleProductAction}>
                        <input type="hidden" name="id" value={product.id} />
                        <input type="hidden" name="active" value={product.active ? "0" : "1"} />
                        <input type="hidden" name="retour" value={here} />
                        <button type="submit" className="link-button">
                          {product.active ? "Archiver" : "Remettre en vente"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPager path="/admin/produits" params={filters} page={page} total={total} pageSize={ADMIN_PRODUCTS_PAGE_SIZE} />
    </>
  );
}
