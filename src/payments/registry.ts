import { createDemoProvider } from "./demo";
import { createStripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

/**
 * Adresse canonique du site (sitemap, e-mails). Sur Vercel : le domaine de
 * production en production, l'adresse propre au déploiement en préversion.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.SITE_URL?.trim();
  if (explicit) return explicit;
  const host = env.VERCEL_ENV === "production" ? env.VERCEL_PROJECT_PRODUCTION_URL : env.VERCEL_URL;
  return host?.trim() ? `https://${host.trim()}` : "http://localhost:3000";
}

export const KNOWN_PROVIDERS = ["demo", "stripe"] as const;
export type ProviderId = (typeof KNOWN_PROVIDERS)[number];

type Env = Record<string, string | undefined>;

export class ProviderConfigError extends Error {}

/**
 * Fournisseurs actifs, selon l'environnement. `PAYMENT_PROVIDERS` liste ceux
 * proposés au client, séparés par des virgules (par défaut : `demo`). Un
 * fournisseur dont les clés manquent est une erreur de configuration, jamais
 * un repli silencieux.
 */
export function enabledProviders(env: Env = process.env): PaymentProvider[] {
  const ids = (env.PAYMENT_PROVIDERS?.trim() || "demo")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const providers = ids.map((id): PaymentProvider => {
    switch (id) {
      case "demo":
        if (env.SHOP_DEMO_NOTICE === "false") {
          throw new ProviderConfigError("Le paiement de démonstration est interdit quand SHOP_DEMO_NOTICE=false (vente réelle).");
        }
        return createDemoProvider();
      case "stripe": {
        const secretKey = env.STRIPE_SECRET_KEY;
        const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
        if (!secretKey || !webhookSecret) {
          throw new ProviderConfigError("Stripe demande STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET.");
        }
        if (secretKey.startsWith("sk_live_") && env.ALLOW_LIVE_PAYMENTS !== "true") {
          throw new ProviderConfigError("Clé Stripe de production refusée : définissez ALLOW_LIVE_PAYMENTS=true en connaissance de cause.");
        }
        return createStripeProvider({ secretKey, webhookSecret });
      }
      default:
        throw new ProviderConfigError(`Fournisseur de paiement inconnu : « ${id} ».`);
    }
  });

  if (providers.length === 0) throw new ProviderConfigError("Aucun fournisseur de paiement configuré.");
  return providers;
}

export function getProvider(id: string, env: Env = process.env): PaymentProvider | undefined {
  return enabledProviders(env).find((provider) => provider.id === id);
}
