import type { Metadata } from "next";
import Link from "next/link";

import { removeFromCartAction, updateQuantityAction } from "@/app/actions/cart";
import { TileArt } from "@/components/ProductTile";
import { store } from "@/config/store";
import { moneyIn } from "@/lib/format";
import { MAX_PER_LINE } from "@/server/cart";
import { getCurrentCart, getDisplayCurrency } from "@/server/context";
import { computeTotals } from "@/server/pricing";

export const metadata: Metadata = { title: "Panier", robots: { index: false } };

export default async function CartPage() {
  const [cart, currency] = await Promise.all([getCurrentCart(), getDisplayCurrency()]);
  const totals = computeTotals(cart.subtotalCents, store.shipping);
  const money = (minor: number) => moneyIn(minor, currency);

  if (cart.lines.length === 0) {
    return (
      <>
        <h1>Votre panier</h1>
        <div className="empty">
          <p>Votre panier est vide.</p>
          <Link href="/boutique" className="button">
            Parcourir le catalogue
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Votre panier</h1>
      {cart.hasProblem && (
        <p className="notice notice-error" role="alert">
          Certains articles ne sont plus disponibles dans la quantité choisie. Ajustez-les avant de commander.
        </p>
      )}

      <div className="two-col">
        <ul className="lines" aria-label="Articles du panier">
          {cart.lines.map((line) => (
            <li key={line.product.id} className="line">
              <TileArt name={line.product.name} tone={line.product.tone} imageUrl={line.product.imageUrl} productId={line.product.id} />
              <div className="line-body">
                <h3>
                  <Link href={`/produit/${line.product.slug}`}>{line.product.name}</Link>
                </h3>
                <p className="price" style={{ margin: 0 }}>
                  {money(line.lineTotalCents)}
                </p>
                <p className="muted small" style={{ margin: 0, gridColumn: "1 / -1" }}>
                  {money(line.product.priceCents)} l&apos;unité
                </p>
                {line.problem === "unavailable" && <p className="line-problem">Cet article n&apos;est plus disponible.</p>}
                {line.problem === "insufficient" && (
                  <p className="line-problem">
                    Seulement {line.available} en stock : réduisez la quantité.
                  </p>
                )}
                <div className="line-actions">
                  <form action={updateQuantityAction} className="actions">
                    <input type="hidden" name="productId" value={line.product.id} />
                    <label htmlFor={`qty-${line.product.id}`} className="sr-only">
                      Quantité de {line.product.name}
                    </label>
                    <input id={`qty-${line.product.id}`} type="number" name="quantity" min={0} max={MAX_PER_LINE} defaultValue={line.quantity} />
                    <button type="submit" className="button button-quiet button-small">
                      Mettre à jour
                    </button>
                  </form>
                  <form action={removeFromCartAction}>
                    <input type="hidden" name="productId" value={line.product.id} />
                    <button type="submit" className="link-button">
                      Retirer
                    </button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="summary" aria-labelledby="summary-title">
          <h2 id="summary-title">Récapitulatif</h2>
          <dl>
            <div className="row">
              <dt>Sous-total</dt>
              <dd>{money(totals.subtotalCents)}</dd>
            </div>
            <div className="row">
              <dt>Livraison</dt>
              <dd>{totals.shippingCents === 0 ? "Offerte" : money(totals.shippingCents)}</dd>
            </div>
            <div className="row total">
              <dt>Total</dt>
              <dd>{money(totals.totalCents)}</dd>
            </div>
          </dl>
          {totals.freeShippingRemainingCents != null && (
            <p className="muted small">
              Encore {money(totals.freeShippingRemainingCents)} d&apos;achats pour la livraison offerte.
            </p>
          )}
          {currency.code !== store.currency.code && (
            <p className="muted small">Montants convertis depuis {store.currency.code}, à titre indicatif.</p>
          )}
          {cart.hasProblem ? (
            <span className="button" aria-disabled="true" role="link">
              Commander
            </span>
          ) : (
            <Link href="/commande" className="button" style={{ width: "100%" }}>
              Commander
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}
