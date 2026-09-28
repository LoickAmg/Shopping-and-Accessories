import type { Metadata, Viewport } from "next";
import Link from "next/link";

import "@fontsource/anton/400.css";
import "@fontsource/bricolage-grotesque/600.css";
import "@fontsource/fraunces/400.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "@fontsource/mrs-saint-delafield/400.css";
import "@fontsource/young-serif/400.css";

import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { store } from "@/config/store";
import { resolveTheme } from "@/config/themes";
import { siteUrl } from "@/payments/registry";
import { getActiveCurrencies, getCurrentCart, getCurrentUser, getDisplayCurrency } from "@/server/context";

import "./globals.css";
import "./theme.css";

const theme = resolveTheme(store.theme);

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${store.name} — ${store.tagline}`, template: `%s — ${store.name}` },
  description: store.description,
  applicationName: store.name,
  openGraph: { type: "website", siteName: store.name, locale: store.locale.replace("-", "_"), title: store.name, description: store.description },
  twitter: { card: "summary" },
};

export const viewport: Viewport = {
  // La direction artistique est sombre quel que soit le preset : barre du navigateur assortie.
  themeColor: "#050505",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [cart, user, currencies, displayCurrency] = await Promise.all([
    getCurrentCart(),
    getCurrentUser(),
    getActiveCurrencies(),
    getDisplayCurrency(),
  ]);

  return (
    <html lang="fr" data-theme={theme.id}>
      <body>
        <a className="skip-link" href="#contenu">
          Aller au contenu
        </a>
        {store.demoNotice && (
          <p className="demo-notice">
            Démo : paiements simulés, aucune expédition. <Link href="/a-propos">En savoir plus</Link>
          </p>
        )}
        <SiteHeader
          cartCount={cart.itemCount}
          user={user ? { name: user.name, role: user.role } : null}
          currencies={currencies}
          currentCurrency={displayCurrency.code}
        />
        <main id="contenu">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
