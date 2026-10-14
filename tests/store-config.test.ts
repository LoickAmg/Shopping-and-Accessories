import { afterEach, describe, expect, it, vi } from "vitest";

import { enabledProviders, siteUrl } from "@/payments/registry";

/**
 * La configuration est lue une fois, au chargement du module : chaque cas
 * recharge donc `@/config/store` avec un environnement préparé. Ces cas
 * reproduisent ce que fait un hébergeur qui importe `.env.example` : des
 * variables présentes mais vides, ou remplies de travers.
 */
async function loadStore(env: Record<string, string>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import("@/config/store")).store;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("configuration de la boutique", () => {
  it("retombe sur les valeurs par défaut quand les variables sont vides", async () => {
    const store = await loadStore({
      SHOP_NAME: "",
      SHOP_CURRENCY: "",
      SHOP_LOCALE: " ",
      SHOP_COUNTRIES: "",
      ORDER_RESERVATION_MINUTES: "",
      SHOP_DEMO_NOTICE: "",
    });
    expect(store.name).toBe("Shopping & Accessories");
    expect(store.currency).toEqual({ code: "XOF", exponent: 0 });
    expect(store.locale).toBe("fr-FR");
    expect(store.shipping.countries).toEqual(["BJ", "TG", "CI", "SN", "FR"]);
    expect(store.orderReservationMinutes).toBe(30);
    expect(store.demoNotice).toBe(true);
  });

  it("refuse une devise ou une langue invalide au lieu de casser le formatage des prix", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = await loadStore({ SHOP_CURRENCY: "XOF (franc CFA)", SHOP_LOCALE: "n'importe quoi" });
    expect(store.currency.code).toBe("XOF");
    expect(store.locale).toBe("fr-FR");
    expect(() => new Intl.NumberFormat(store.locale, { style: "currency", currency: store.currency.code }).format(1)).not.toThrow();
  });

  it("lit une configuration valide, nettoyée", async () => {
    const store = await loadStore({
      SHOP_CURRENCY: " eur ",
      SHOP_LOCALE: "fr-be",
      SHOP_COUNTRIES: " bj , fr ,, ",
      ORDER_RESERVATION_MINUTES: "45",
      SHOP_DEMO_NOTICE: "false",
    });
    expect(store.currency).toEqual({ code: "EUR", exponent: 2 });
    expect(store.locale).toBe("fr-BE");
    expect(store.shipping.countries).toEqual(["BJ", "FR"]);
    expect(store.orderReservationMinutes).toBe(45);
    expect(store.demoNotice).toBe(false);
  });

  it("ne laisse jamais une durée de réservation nulle ou négative faire expirer les commandes aussitôt", async () => {
    for (const value of ["0", "-5", "abc", "Infinity"]) {
      expect((await loadStore({ ORDER_RESERVATION_MINUTES: value })).orderReservationMinutes, value).toBe(30);
    }
  });
});

describe("paiement et adresse publique", () => {
  it("propose le paiement de démonstration quand PAYMENT_PROVIDERS est vide", () => {
    expect(enabledProviders({ PAYMENT_PROVIDERS: "" }).map((provider) => provider.id)).toEqual(["demo"]);
    expect(enabledProviders({ PAYMENT_PROVIDERS: "  " }).map((provider) => provider.id)).toEqual(["demo"]);
  });

  it("déduit l'adresse publique de Vercel quand SITE_URL est vide", () => {
    expect(siteUrl({ SITE_URL: "", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "boutique.vercel.app" })).toBe(
      "https://boutique.vercel.app",
    );
    expect(siteUrl({ SITE_URL: " https://exemple.test " })).toBe("https://exemple.test");
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});
