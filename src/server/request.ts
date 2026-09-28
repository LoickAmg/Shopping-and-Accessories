import { createHash } from "node:crypto";

/**
 * Empreinte d'un visiteur pour la limitation de débit. L'adresse IP n'est
 * jamais stockée : seule une empreinte salée l'est, dans une table qui se vide
 * d'elle-même.
 */
export function clientFingerprint(headers: Headers, secret = process.env.APP_SECRET ?? "dev-secret"): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(`${secret}|${ip}`).digest("hex").slice(0, 32);
}

export function fingerprintOf(value: string, secret = process.env.APP_SECRET ?? "dev-secret"): string {
  return createHash("sha256").update(`${secret}|${value.toLowerCase()}`).digest("hex").slice(0, 32);
}
