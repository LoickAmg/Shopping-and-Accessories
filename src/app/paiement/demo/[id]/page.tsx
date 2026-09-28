import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { completeDemoPaymentAction } from "@/app/actions/demo-payment";
import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { orderMoney } from "@/lib/format";
import { getProvider } from "@/payments/registry";
import { getOrderWithToken } from "@/server/orders";

export const metadata: Metadata = { title: "Paiement de démonstration", robots: { index: false, follow: false } };

export default async function DemoPaymentPage({ params, searchParams }: PageProps<"/paiement/demo/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const token = Array.isArray(query.token) ? query.token[0] : query.token;

  let enabled = false;
  try {
    enabled = Boolean(getProvider("demo"));
  } catch {
    enabled = false;
  }
  if (!enabled || !token) notFound();

  const order = await getOrderWithToken(await getDb(), id, token);
  if (!order || order.paymentProvider !== "demo" || order.status !== "pending") notFound();

  return (
    <div className="form-narrow stack">
      <p className="eyebrow">Paiement de démonstration</p>
      <h1>Payer {orderMoney(order.totalCents, order.currency)}</h1>
      <p className="notice">
        Ceci simule la page d&apos;un agrégateur de paiement : aucun argent n&apos;est débité. En production, cette étape est remplacée par Stripe, FedaPay, KKiaPay ou un mobile money.
      </p>
      <p className="muted">
        Commande n° {order.number} · {store.name}
      </p>
      <form action={completeDemoPaymentAction} className="actions">
        <input type="hidden" name="orderId" value={order.id} />
        <input type="hidden" name="token" value={token} />
        <button type="submit" name="outcome" value="pay" className="button">
          Simuler un paiement réussi
        </button>
        <button type="submit" name="outcome" value="refuse" className="button button-quiet">
          Simuler un refus
        </button>
      </form>
    </div>
  );
}
