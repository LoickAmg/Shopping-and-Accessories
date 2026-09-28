import Link from "next/link";

import { getDb } from "@/db/client";
import { money } from "@/lib/format";
import { getDashboardStats } from "@/server/admin";
import { sweepExpiredOrders } from "@/server/context";

export default async function AdminDashboard() {
  const db = await getDb();
  await sweepExpiredOrders();
  const stats = await getDashboardStats(db);

  return (
    <>
      <h1>Tableau de bord</h1>

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
          <dd>{stats.outOfStock}</dd>
        </div>
      </dl>

      <h2>Stock bas</h2>
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
              {stats.lowStock.map((product) => (
                <tr key={product.id}>
                  <td>
                    <Link href={`/admin/produits/${product.id}`}>{product.name}</Link>
                  </td>
                  <td className="num">{product.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
