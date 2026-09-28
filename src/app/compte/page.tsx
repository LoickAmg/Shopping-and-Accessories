import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { getDb } from "@/db/client";
import { STATUS_LABELS, formatDate, orderMoney } from "@/lib/format";
import { getCurrentUser } from "@/server/context";
import { listOrdersForUser } from "@/server/orders";

export const metadata: Metadata = { title: "Mon compte", robots: { index: false } };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/compte/connexion");

  const orders = await listOrdersForUser(await getDb(), user.id);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Mon compte</p>
          <h1>{user.name || user.email}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {user.email}
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="button button-quiet">
            Me déconnecter
          </button>
        </form>
      </div>

      <h2>Mes commandes</h2>
      {orders.length === 0 ? (
        <div className="empty">
          <p>Vous n&apos;avez pas encore passé de commande.</p>
          <Link href="/boutique" className="button">
            Parcourir le catalogue
          </Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Commande</th>
                <th scope="col">Date</th>
                <th scope="col">État</th>
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/commande/${order.id}?token=${order.accessToken}`}>n° {order.number}</Link>
                  </td>
                  <td>{formatDate(order.createdAt)}</td>
                  <td>
                    <span className={`status status-${order.status}`}>{STATUS_LABELS[order.status]}</span>
                  </td>
                  <td className="num">{orderMoney(order.totalCents, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {user.role === "admin" && (
        <p style={{ marginTop: "var(--space-6)" }}>
          <Link href="/admin">Ouvrir l&apos;administration</Link>
        </p>
      )}
    </>
  );
}
