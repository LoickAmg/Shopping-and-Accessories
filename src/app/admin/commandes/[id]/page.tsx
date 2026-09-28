import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { orderAdminAction } from "@/app/actions/admin";
import { COUNTRY_NAMES, store } from "@/config/store";
import { getDb } from "@/db/client";
import { STATUS_LABELS, formatDate, orderMoney } from "@/lib/format";
import { getOrder } from "@/server/orders";

export const metadata: Metadata = { title: "Commande" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminOrderPage({ params }: PageProps<"/admin/commandes/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const order = await getOrder(await getDb(), id);
  if (!order) notFound();

  const address = order.shippingAddress;
  const refundDue = ["cancelled", "expired"].includes(order.status) && Boolean(order.paymentReference);
  const money = (minor: number) => orderMoney(minor, order.currency);

  return (
    <>
      <p className="eyebrow">
        <Link href="/admin/commandes">Commandes</Link> / n° {order.number}
      </p>
      <h1>Commande n° {order.number}</h1>
      {order.currency !== store.currency.code && (
        <p className="muted small">Facturée en {order.currency}, devise de base de la boutique : {store.currency.code}.</p>
      )}

      {refundDue && (
        <p className="notice notice-error" role="alert">
          Un paiement a été reçu (référence {order.paymentReference}) pour une commande qui ne sera pas honorée. Remboursez le client chez le fournisseur de paiement, puis marquez la commande comme remboursée.
        </p>
      )}

      <div className="two-col">
        <section aria-labelledby="lines">
          <h2 id="lines">Articles</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Produit</th>
                  <th scope="col" className="num">
                    Qté
                  </th>
                  <th scope="col" className="num">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td className="num">{item.quantity}</td>
                    <td className="num">{money(item.unitPriceCents * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: "var(--space-6)" }}>Actions</h2>
          <div className="actions">
            {order.status === "paid" && (
              <form action={orderAdminAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" name="action" value="fulfill" className="button">
                  Marquer comme expédiée
                </button>
              </form>
            )}
            {(order.status === "pending" || order.status === "paid") && (
              <form action={orderAdminAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" name="action" value="cancel" className="button button-danger">
                  Annuler et rendre le stock
                </button>
              </form>
            )}
            {refundDue && (
              <form action={orderAdminAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button type="submit" name="action" value="refund" className="button button-quiet">
                  Marquer comme remboursée
                </button>
              </form>
            )}
          </div>

          {(order.status === "pending" || order.status === "expired") && (
            <form action={orderAdminAction} className="stack" style={{ marginTop: "var(--space-5)", maxWidth: "26rem" }}>
              <h3>Paiement reçu hors ligne</h3>
              <p className="muted small">Virement, espèces ou mobile money reçu directement : la commande passe en « payée ».</p>
              <input type="hidden" name="orderId" value={order.id} />
              <div className="field">
                <label htmlFor="note">Référence ou note</label>
                <input id="note" name="note" maxLength={80} placeholder="ex : virement du 21/09" />
              </div>
              <button type="submit" name="action" value="manual-pay" className="button button-quiet">
                Enregistrer le paiement
              </button>
            </form>
          )}
        </section>

        <aside className="summary" aria-labelledby="info">
          <h2 id="info">Informations</h2>
          <dl>
            <div className="row">
              <dt>État</dt>
              <dd>
                <span className={`status status-${order.status}`}>{STATUS_LABELS[order.status]}</span>
              </dd>
            </div>
            <div className="row">
              <dt>Passée le</dt>
              <dd>{formatDate(order.createdAt)}</dd>
            </div>
            {order.paidAt && (
              <div className="row">
                <dt>Payée le</dt>
                <dd>{formatDate(order.paidAt)}</dd>
              </div>
            )}
            <div className="row">
              <dt>Paiement</dt>
              <dd>{order.paymentProvider}</dd>
            </div>
            <div className="row">
              <dt>Sous-total</dt>
              <dd>{money(order.subtotalCents)}</dd>
            </div>
            <div className="row">
              <dt>Livraison</dt>
              <dd>{order.shippingCents === 0 ? "Offerte" : money(order.shippingCents)}</dd>
            </div>
            <div className="row total">
              <dt>Total</dt>
              <dd>{money(order.totalCents)}</dd>
            </div>
          </dl>
          <h3>Client</h3>
          <address style={{ fontStyle: "normal" }}>
            {order.customerName}
            <br />
            <a href={`mailto:${order.email}`}>{order.email}</a>
            {address.phone && (
              <>
                <br />
                {address.phone}
              </>
            )}
            <br />
            <br />
            {address.line1}
            {address.line2 && (
              <>
                <br />
                {address.line2}
              </>
            )}
            <br />
            {address.postalCode} {address.city}
            <br />
            {COUNTRY_NAMES[address.country] ?? address.country}
          </address>
        </aside>
      </div>
    </>
  );
}
