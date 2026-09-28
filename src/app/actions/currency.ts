"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getDb } from "@/db/client";
import { safeReturnPath } from "@/lib/redirect";
import { CURRENCY_COOKIE, cookieOptions } from "@/server/context";
import { listActiveCurrencies } from "@/server/currency";

/** Mémorise la devise d'affichage choisie (cookie, un an) puis revient à la page d'origine. */
export async function setDisplayCurrencyAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const active = await listActiveCurrencies(await getDb());

  if (active.some((currency) => currency.code === code)) {
    (await cookies()).set(CURRENCY_COOKIE, code, cookieOptions(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)));
  }
  redirect(safeReturnPath(formData.get("retour"), "/"));
}
