import type { Metadata } from "next";
import Link from "next/link";

import { saveStockAction } from "@/app/actions/admin";
import { AdminPager, currentPath, pageParam, param } from "@/components/AdminPager";
import { getDb } from "@/db/client";
import { formatDate } from "@/lib/format";
import { LOW_STOCK_THRESHOLD } from "@/server/admin";
import { requireStaff } from "@/server/guard";
import { STOCK_PAGE_SIZE, STOCK_REASON_LABELS, listMovements, listStockRows } from "@/server/stock";

export const metadata: Metadata = { title: "Stock" };

export default async function AdminStockPage({ searchParams }: PageProps<"/admin/stock">) {
  await requireStaff();
  const query = await searchParams;
  const q = param(query.q).trim().slice(0, 80);
  const niveau = param(query.niveau);
  const produit = param(query.produit);
  const page = pageParam(query.page);
  const productId = Number(produit) > 0 ? Number(produit) : undefined;

  const db = await getDb();
  const [{ rows, total }, movements] = await Promise.all([
    listStockRows(db, { q, level: niveau === "bas" || niveau === "rupture" ? niveau : undefined, productId, page }),
    listMovements(db, { productId, limit: 25 }),
  ]);
  const filters = { q, niveau, produit };
  const here = currentPath("/admin/stock", filters, page);
  const saved = Number(param(query.enregistre));
  const refused = Number(param(query.refuse));

  return (
    <>
      <div className="page-head">
        <h1>Stock</h1>
        <p className="muted small">Corrigez les quantités puis enregistrez : seules les lignes modifiées sont prises en compte.</p>
      </div>

      {param(query.enregistre) !== "" && (
        <p className="notice notice-ok" role="status">
          {saved > 0 ? `${saved} ligne${saved > 1 ? "s" : ""} de stock mise${saved > 1 ? "s" : ""} à jour.` : "Aucun changement à enregistrer."}
        </p>
      )}
      {refused > 0 && (
        <p className="notice notice-error" role="alert">
          {refused} ligne{refused > 1 ? "s" : ""} non enregistrée{refused > 1 ? "s" : ""} : quantité invalide, ou stock déjà vendu entre-temps. Vérifiez les valeurs
          affichées.
        </p>
      )}

      <form className="admin-filters" role="search" action="/admin/stock">
        <div className="field admin-filters-search">
          <label htmlFor="q">Rechercher</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Produit, taille, référence…" />
        </div>
        <div className="field">
          <label htmlFor="niveau">Afficher</label>
          <select id="niveau" name="niveau" defaultValue={niveau}>
            <option value="">Toutes les déclinaisons</option>
            <option value="bas">Stock bas (≤ {LOW_STOCK_THRESHOLD})</option>
            <option value="rupture">En rupture</option>
          </select>
        </div>
        <div className="admin-filters-actions">
          <button type="submit" className="button button-small">
            Filtrer
          </button>
          {(q || niveau || produit) && (
            <Link href="/admin/stock" className="small">
              Tout afficher
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="empty">Aucune déclinaison ne correspond.</p>
      ) : (
        <form action={saveStockAction}>
          <input type="hidden" name="retour" value={here} />
          <div className="table-wrap">
            <table className="admin-stock">
              <thead>
                <tr>
                  <th scope="col">Produit</th>
                  <th scope="col">Taille / couleur</th>
                  <th scope="col">Référence</th>
                  <th scope="col" className="num">
                    Stock
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.variantId} className={row.productActive ? undefined : "is-archived"}>
                    <td>
                      <Link href={`/admin/produits/${row.productId}`}>{row.productName}</Link>
                      {!row.productActive && <span className="muted small"> · archivé</span>}
                    </td>
                    <td>{row.label || <span className="muted">Taille unique</span>}</td>
                    <td className="muted small">{row.sku ?? "—"}</td>
                    <td className="num">
                      <input type="hidden" name={`orig_${row.variantId}`} value={row.stock} />
                      <input
                        className={`stock-input${row.stock <= 0 ? " stock-out" : row.stock <= LOW_STOCK_THRESHOLD ? " stock-low" : ""}`}
                        name={`stock_${row.variantId}`}
                        defaultValue={row.stock}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        aria-label={`Stock de ${row.productName}${row.label ? `, ${row.label}` : ""}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions sticky-actions">
            <button type="submit" className="button">
              Enregistrer les stocks
            </button>
            <span className="muted small">
              {total} déclinaison{total > 1 ? "s" : ""}
            </span>
          </div>
        </form>
      )}

      <AdminPager path="/admin/stock" params={filters} page={page} total={total} pageSize={STOCK_PAGE_SIZE} />

      <h2 style={{ marginTop: "var(--space-7, 4rem)" }}>Derniers mouvements</h2>
      {movements.length === 0 ? (
        <p className="muted">Aucun mouvement enregistré pour l&apos;instant.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Produit</th>
                <th scope="col">Motif</th>
                <th scope="col" className="num">
                  Mouvement
                </th>
                <th scope="col" className="num">
                  Après
                </th>
                <th scope="col">Par</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="small">{formatDate(movement.createdAt)}</td>
                  <td>
                    <Link href={`/admin/produits/${movement.productId}`}>{movement.productName}</Link>
                    {movement.label && <span className="muted small"> — {movement.label}</span>}
                  </td>
                  <td>
                    {STOCK_REASON_LABELS[movement.reason]}
                    {movement.orderId && (
                      <>
                        {" "}
                        <Link href={`/admin/commandes/${movement.orderId}`} className="small">
                          (commande)
                        </Link>
                      </>
                    )}
                  </td>
                  <td className={`num ${movement.delta > 0 ? "delta-up" : "delta-down"}`}>
                    {movement.delta > 0 ? "+" : ""}
                    {movement.delta}
                  </td>
                  <td className="num">{movement.stockAfter ?? "—"}</td>
                  <td className="small muted">{movement.actorEmail ?? (movement.reason === "ajustement" ? "—" : "Boutique")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
