import Link from "next/link";

import { store } from "@/config/store";

import { CurrencySwitcher } from "./CurrencySwitcher";
import { HeaderSearch } from "./HeaderSearch";
import { PillNav } from "./PillNav";

interface Props {
  cartCount: number;
  user: { name: string; role: "customer" | "admin" } | null;
  currencies: { code: string }[];
  currentCurrency: string;
}

export function SiteHeader({ cartCount, user, currencies, currentCurrency }: Props) {
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label={`${store.name}, accueil`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-emblem" src="/assets/logo-emblem.png" alt="" width={122} height={160} />
        <span className="brand-words" aria-hidden="true">
          <span className="brand-shopping">Shopping</span>
          <span className="brand-amp">&amp; Accessories</span>
        </span>
      </Link>
      <PillNav />
      <div className="header-tools">
        <HeaderSearch />
        <CurrencySwitcher currencies={currencies} current={currentCurrency} />
        {user?.role === "admin" && (
          <Link href="/admin" className="header-link">
            Admin
          </Link>
        )}
        <Link href={user ? "/compte" : "/compte/connexion"} className="header-link">
          {user ? "Compte" : "Connexion"}
        </Link>
        <Link href="/panier" className="cart-link">
          Panier{" "}
          <span className="cart-count" aria-label={`${cartCount} article${cartCount > 1 ? "s" : ""} dans le panier`}>
            {cartCount}
          </span>
        </Link>
      </div>
    </header>
  );
}
