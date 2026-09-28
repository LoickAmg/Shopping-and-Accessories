import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { store, COUNTRY_NAMES } from "@/config/store";
import { getDb } from "@/db/client";
import { STATUS_LABELS, formatDate, orderMoney } from "@/lib/format";
import { getOrderWithToken } from "@/server/orders";

export const metadata: Metadata = { title: "Suivi de commande", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function OrderPage({ params, searchParams }: PageProps<"/commande/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const token = Array.isArray(query.token) ? query.token[0] : query.token;
  if (!UUID.test(id) || !token) notFound();

  const order = await getOrderWithToken(await getDb(), id, token);
  if (!order) notFound();

  const pending = order.status === "pending";
  const returnedFromProvider = Boolean(query.session_id);
  const address = order.shippingAddress;
  const money = (minor: number) => orderMoney(minor, order.currency);

  return (
    <>
      {pending && returnedFromProvider && <meta httpEquiv="refresh" content="4" />}

      <p className="eyebrow">Commande n° {order.number}</p>
      <h1>
        {order.status === "paid" || order.status === "fulfilled"
          ? "Merci, votre commande est confirmée"
          : pending
            ? returnedFromProvider
              ? "Confirmation du paiement en cours…"
              : "Commande en attente de paiement"
            : "Suivi de commande"}
      </h1>

      {query.annule && pending && (
        <p className="notice">Le paiement a été interrompu. Votre commande est conservée jusqu&apos;au {formatDate(order.expiresAt)} ; vous pouvez la payer avant cette échéance.</p>
      )}
      {pending && returnedFromProvider && (
        <p className="notice" role="status">
          Nous attendons la confirmation de votre banque. Cette page se met à jour toute seule.
        </p>
      )}
      {order.status === "paid" && (
        <p className="notice notice-ok" role="status">
          Paiement reçu. Un e-mail de confirmation est envoyé à {order.email} lorsque l&apos;envoi de messages est configuré.
        </p>
      )}
      {(order.status === "expired" || order.status === "cancelled") && (
        <p className="notice notice-error">Cette commande n&apos;est plus valable ({STATUS_LABELS[order.status].toLowerCase()}). Le stock a été rendu.</p>
      )}

      <div className="two-col">
        <section aria-labelledby="items-title">
          <h2 id="items-title">Articles</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Produit</th>
                  <th scope="col" className="num">
                    Quantité
                  </th>
                  <th scope="col" className="num">
                    Prix
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
        </section>

        <aside className="summary" aria-labelledby="order-summary">
          <h2 id="order-summary">Récapitulatif</h2>
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
          <h3>Livraison</h3>
          <address style={{ fontStyle: "normal" }}>
            {order.customerName}
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

      <p style={{ marginTop: "var(--space-6)" }}>
        <Link href="/boutique">Retourner à la boutique {store.name}</Link>
      </p>
    </>
  );
}
