import Link from "next/link";

import { getDb } from "@/db/client";
import { money } from "@/lib/format";
import { getDashboardStats } from "@/server/admin";
import { sweepExpiredOrders } from "@/server/context";
import { requireStaff } from "@/server/guard";

export default async function AdminDashboard({ searchParams }: PageProps<"/admin">) {
  await requireStaff();
  const db = await getDb();
  await sweepExpiredOrders();
  const stats = await getDashboardStats(db);

  return (
    <>
      <h1>Tableau de bord</h1>

      {(await searchParams).interdit && (
        <p className="notice notice-error" role="alert">
          Cette page est réservée à l&apos;administrateur de la boutique.
        </p>
      )}

      {stats.refundsDue > 0 && (
        <p className="notice notice-error" role="alert">
          {stats.refundsDue} paiement{stats.refundsDue > 1 ? "s" : ""} reçu{stats.refundsDue > 1 ? "s" : ""} pour une commande annulée ou expirée :{" "}
          <Link href="/admin/commandes?etat=cancelled">à rembourser</Link>.
        </p>
      )}

      <dl className="stats">
        <div>
          <dt>Commandes payées</dt>
          <dd>{stats.paidOrders}</dd>
        </div>
        <div>
          <dt>Chiffre d&apos;affaires</dt>
          <dd>{money(stats.revenueCents)}</dd>
        </div>
        <div>
          <dt>En attente de paiement</dt>
          <dd>{stats.pendingOrders}</dd>
        </div>
        <div>
          <dt>Produits actifs</dt>
          <dd>{stats.activeProducts}</dd>
        </div>
        <div>
          <dt>Ruptures</dt>
          <dd>
            <Link href="/admin/produits?stock=rupture&statut=en-vente">{stats.outOfStock}</Link>
          </dd>
        </div>
      </dl>

      <div className="page-head" style={{ borderBottom: 0, paddingBottom: 0, marginBottom: "var(--space-4)" }}>
        <h2 style={{ margin: 0 }}>Stock bas</h2>
        <Link href="/admin/stock?niveau=bas" className="small">
          Tout corriger dans la page Stock →
        </Link>
      </div>
      {stats.lowStock.length === 0 ? (
        <p className="muted">Aucun produit sous le seuil d&apos;alerte.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Produit</th>
                <th scope="col" className="num">
                  Stock
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.lowStock.map((line) => (
                <tr key={`${line.productId}-${line.label}`}>
                  <td>
                    <Link href={`/admin/produits/${line.productId}`}>{line.name}</Link>
                    {line.label && <span className="muted"> — {line.label}</span>}
                  </td>
                  <td className="num">{line.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
