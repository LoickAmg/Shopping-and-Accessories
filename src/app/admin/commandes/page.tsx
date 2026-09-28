import type { Metadata } from "next";
import Link from "next/link";

import { getDb } from "@/db/client";
import { ORDER_STATUSES } from "@/db/schema";
import type { OrderStatus } from "@/db/schema";
import { STATUS_LABELS, formatDate, orderMoney } from "@/lib/format";
import { listOrders } from "@/server/orders";

export const metadata: Metadata = { title: "Commandes" };

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/commandes">) {
  const query = await searchParams;
  const stateParam = Array.isArray(query.etat) ? query.etat[0] : query.etat;
  const status = (ORDER_STATUSES as readonly string[]).includes(stateParam ?? "") ? (stateParam as OrderStatus) : undefined;
  const page = Number.parseInt(String(Array.isArray(query.page) ? query.page[0] : (query.page ?? "")), 10) || 1;

  const result = await listOrders(await getDb(), { status, page });
  const link = (etat?: string, nextPage = 1) => {
    const params = new URLSearchParams();
    if (etat) params.set("etat", etat);
    if (nextPage > 1) params.set("page", String(nextPage));
    const suffix = params.toString();
    return suffix ? `/admin/commandes?${suffix}` : "/admin/commandes";
  };

  return (
    <>
      <h1>Commandes</h1>

      <nav className="admin-nav" aria-label="Filtrer par état">
        <Link href={link()} aria-current={!status ? "page" : undefined}>
          Toutes
        </Link>
        {ORDER_STATUSES.map((value) => (
          <Link key={value} href={link(value)} aria-current={status === value ? "page" : undefined}>
            {STATUS_LABELS[value]}
          </Link>
        ))}
      </nav>

      {result.items.length === 0 ? (
        <p className="empty">Aucune commande.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Commande</th>
                <th scope="col">Date</th>
                <th scope="col">Client</th>
                <th scope="col">État</th>
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/admin/commandes/${order.id}`}>n° {order.number}</Link>
                  </td>
                  <td>{formatDate(order.createdAt)}</td>
                  <td>
                    {order.customerName}
                    <br />
                    <span className="muted small">{order.email}</span>
                  </td>
                  <td>
                    <span className={`status status-${order.status}`}>{STATUS_LABELS[order.status]}</span>
                    {["cancelled", "expired"].includes(order.status) && order.paymentReference && (
                      <>
                        <br />
                        <span className="status status-alert">Remboursement à faire</span>
                      </>
                    )}
                  </td>
                  <td className="num">{orderMoney(order.totalCents, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.pageCount > 1 && (
        <nav className="pagination" aria-label="Pagination">
          {result.page > 1 ? <Link href={link(status, result.page - 1)}>← Précédent</Link> : <span />}
          <span>
            Page {result.page} sur {result.pageCount}
          </span>
          {result.page < result.pageCount ? <Link href={link(status, result.page + 1)}>Suivant →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
