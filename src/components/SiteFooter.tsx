import Link from "next/link";

import { store } from "@/config/store";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          <p className="wordmark" style={{ margin: 0 }}>
            {store.name}
          </p>
          <p className="muted" style={{ maxWidth: "32ch" }}>
            {store.tagline}
          </p>
        </div>
        <nav aria-label="Boutique">
          <h2>Boutique</h2>
          <ul>
            <li>
              <Link href="/boutique">Tous les produits</Link>
            </li>
            <li>
              <Link href="/panier">Panier</Link>
            </li>
            <li>
              <Link href="/compte">Mon compte</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Informations légales">
          <h2>Informations</h2>
          <ul>
            <li>
              <Link href="/livraison-retours">Livraison et retours</Link>
            </li>
            <li>
              <Link href="/cgv">Conditions de vente</Link>
            </li>
            <li>
              <Link href="/mentions-legales">Mentions légales</Link>
            </li>
            <li>
              <Link href="/confidentialite">Confidentialité et cookies</Link>
            </li>
            <li>
              <Link href="/contact">Contact</Link>
            </li>
          </ul>
        </nav>
        <p className="fine">
          © {new Date().getFullYear()} {store.name}. Les prix sont indiqués en {store.currency.code}.
        </p>
      </div>
    </footer>
  );
}
