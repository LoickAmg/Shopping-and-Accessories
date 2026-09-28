import type { Metadata } from "next";
import Link from "next/link";

import { CheckoutForm } from "@/components/CheckoutForm";
import { COUNTRY_NAMES, store } from "@/config/store";
import { moneyIn } from "@/lib/format";
import { enabledProviders } from "@/payments/registry";
import { getCurrentCart, getCurrentUser, getDisplayCurrency } from "@/server/context";
import { computeTotals } from "@/server/pricing";

export const metadata: Metadata = { title: "Commande", robots: { index: false } };

export default async function CheckoutPage() {
  const [cart, user, currency] = await Promise.all([getCurrentCart(), getCurrentUser(), getDisplayCurrency()]);
  const money = (minor: number) => moneyIn(minor, currency);

  if (cart.lines.length === 0) {
    return (
      <>
        <h1>Commande</h1>
        <div className="empty">
          <p>Votre panier est vide.</p>
          <Link href="/boutique" className="button">
            Parcourir le catalogue
          </Link>
        </div>
      </>
    );
  }

  if (cart.hasProblem) {
    return (
      <>
        <h1>Commande</h1>
        <p className="notice notice-error" role="alert">
          Certains articles ne sont plus disponibles dans la quantité choisie.
        </p>
        <Link href="/panier" className="button">
          Revoir le panier
        </Link>
      </>
    );
  }

  const totals = computeTotals(cart.subtotalCents, store.shipping);
  const countries = store.shipping.countries.map((code) => ({ code, name: COUNTRY_NAMES[code] ?? code }));
  const providers = enabledProviders().map((provider) => ({ id: provider.id, label: provider.label }));

  return (
    <>
      <h1>Commande</h1>
      {!user && (
        <p className="muted">
          Vous avez un compte ? <Link href="/compte/connexion?retour=/commande">Connectez-vous</Link> pour retrouver vos commandes. Sinon, vous pouvez commander sans compte.
        </p>
      )}
      <div className="two-col">
        <CheckoutForm countries={countries} providers={providers} defaults={{ email: user?.email ?? "", name: user?.name ?? "" }} />

        <aside className="summary" aria-labelledby="summary-title">
          <h2 id="summary-title">Votre commande</h2>
          <dl>
            {cart.lines.map((line) => (
              <div className="row" key={line.product.id}>
                <dt>
                  {line.quantity} × {line.product.name}
                </dt>
                <dd>{money(line.lineTotalCents)}</dd>
              </div>
            ))}
            <div className="row">
              <dt>Livraison</dt>
              <dd>{totals.shippingCents === 0 ? "Offerte" : money(totals.shippingCents)}</dd>
            </div>
            <div className="row total">
              <dt>Total</dt>
              <dd>{money(totals.totalCents)}</dd>
            </div>
          </dl>
          <p className="muted small">
            Le stock est réservé pendant {store.orderReservationMinutes} minutes après validation, le temps de payer.
            {currency.code !== store.currency.code && ` Facturé en ${currency.code}.`}
          </p>
        </aside>
      </div>
    </>
  );
}
