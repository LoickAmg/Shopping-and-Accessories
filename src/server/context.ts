import { cache } from "react";

import { cookies } from "next/headers";

import { store } from "@/config/store";
import { getDb } from "@/db/client";
import type { Currency, User } from "@/db/schema";
import { RATE_SCALE } from "@/lib/currency";
import { getCartView } from "@/server/cart";
import type { CartView } from "@/server/cart";
import { getSessionUser } from "@/server/auth";
import { listActiveCurrencies } from "@/server/currency";
import { expireStaleOrders } from "@/server/orders";

export const SESSION_COOKIE = "etal_session";
export const CART_COOKIE = "etal_cart";
export const CURRENCY_COOKIE = "etal_currency";

/**
 * Repli si la table `currencies` n'est pas encore garnie (jamais le cas en
 * usage normal : `ensureCurrenciesSeeded` tourne à la migration et au premier
 * accès en développement) : la devise de base reste utilisable sans conversion.
 */
const FALLBACK_CURRENCY: Currency = {
  code: store.currency.code,
  exponent: store.currency.exponent,
  rateMicros: RATE_SCALE,
  isBase: true,
  active: true,
  position: 0,
  updatedAt: new Date(0),
};

const isProduction = process.env.NODE_ENV === "production";

export function cookieOptions(expires?: Date) {
  return { httpOnly: true, sameSite: "lax" as const, secure: isProduction, path: "/", ...(expires ? { expires } : {}) };
}

/** Utilisateur connecté (au plus une lecture en base par requête). */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getSessionUser(await getDb(), token);
});

export async function getCartId(): Promise<string | undefined> {
  return (await cookies()).get(CART_COOKIE)?.value;
}

export const getCurrentCart = cache(async (): Promise<CartView> => {
  return getCartView(await getDb(), await getCartId());
});

/** Devises actives (la devise de base au minimum, même si aucune autre n'est activée). */
export const getActiveCurrencies = cache(async (): Promise<Currency[]> => {
  const active = await listActiveCurrencies(await getDb());
  return active.length > 0 ? active : [FALLBACK_CURRENCY];
});

/** Devise choisie par le visiteur (cookie), repliée sur la devise de base si absente, inactive ou inconnue. */
export const getDisplayCurrency = cache(async (): Promise<Currency> => {
  const active = await getActiveCurrencies();
  const wanted = (await cookies()).get(CURRENCY_COOKIE)?.value;
  return active.find((currency) => currency.code === wanted) ?? active.find((currency) => currency.isBase) ?? active[0];
});

let lastSweep = 0;

/**
 * Annule les commandes impayées expirées. Il n'y a pas de tâche planifiée sur
 * l'offre gratuite de l'hébergeur : le nettoyage se fait donc au fil des
 * visites, au plus une fois par minute et par processus.
 */
export async function sweepExpiredOrders(): Promise<void> {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  try {
    await expireStaleOrders(await getDb());
  } catch {
    lastSweep = 0;
  }
}
