// Bloque un déploiement de production dont la configuration est incomplète ou dangereuse.
const production = process.env.VERCEL_ENV === "production" || process.env.CHECK_PRODUCTION_ENV === "1";
if (!production) process.exit(0);

const env = (name) => process.env[name]?.trim() ?? "";
const problems = [];

for (const name of ["DATABASE_URL", "APP_SECRET", "SHOP_LEGAL_NAME", "SHOP_CONTACT_EMAIL", "ADMIN_EMAIL"]) {
  if (!env(name)) problems.push(`${name} est obligatoire en production.`);
}
if (env("APP_SECRET") && env("APP_SECRET").length < 32) problems.push("APP_SECRET doit faire au moins 32 caractères.");

const providers = (env("PAYMENT_PROVIDERS") || "demo").split(",").map((id) => id.trim());
if (providers.includes("demo") && env("SHOP_DEMO_NOTICE") === "false") {
  problems.push("Le paiement de démonstration est incompatible avec SHOP_DEMO_NOTICE=false.");
}
if (providers.includes("stripe") && (!env("STRIPE_SECRET_KEY") || !env("STRIPE_WEBHOOK_SECRET"))) {
  problems.push("Stripe demande STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET.");
}
if (env("STRIPE_SECRET_KEY").startsWith("sk_live_") && env("ALLOW_LIVE_PAYMENTS") !== "true") {
  problems.push("Clé Stripe de production détectée : confirmez avec ALLOW_LIVE_PAYMENTS=true.");
}

if (problems.length > 0) {
  console.error("Configuration de production incomplète :\n- " + problems.join("\n- "));
  process.exit(1);
}
