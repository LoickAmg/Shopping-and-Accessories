"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { parseRateInput } from "@/lib/currency";
import { parseMoneyInput } from "@/lib/money";
import { MissingRateError, getCurrency, setCurrencyRate } from "@/server/currency";
import {
  createCategory,
  createProduct,
  deleteCategory,
  setProductActive,
  updateCategory,
  updateProduct,
} from "@/server/admin";
import type { ProductInput } from "@/server/admin";
import { requireAdmin } from "@/server/guard";
import { cancelOrder, fulfillOrder, markOrderPaidManually, markOrderRefunded } from "@/server/orders";

export interface AdminFormState {
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

const TONES = ["t1", "t2", "t3", "t4", "t5", "t6"] as const;

function parsePrice(label: string, raw: string, ctx: z.RefinementCtx): number | typeof z.NEVER {
  const minor = parseMoneyInput(raw.trim(), store.currency.exponent);
  if (minor == null) {
    const hint = store.currency.exponent === 0 ? "sans décimale" : `jusqu'à ${store.currency.exponent} décimales`;
    ctx.addIssue({ code: "custom", message: `${label} : nombre attendu (${hint}).` });
    return z.NEVER;
  }
  return minor;
}

const requiredPrice = (label: string) => z.string().transform((raw, ctx) => parsePrice(label, raw, ctx));

const optionalPrice = (label: string) =>
  z.string().transform((raw, ctx): number | null | typeof z.NEVER => (raw.trim() === "" ? null : parsePrice(label, raw, ctx)));

const productSchema = z.object({
  name: z.string().trim().min(2, "Le nom est obligatoire.").max(160),
  slug: z.string().trim().max(160).optional(),
  summary: z.string().trim().max(300),
  description: z.string().trim().max(5000),
  categoryId: z.string().transform((value) => (value === "" ? null : Number(value))),
  priceCents: requiredPrice("Le prix"),
  compareAtCents: optionalPrice("Le prix barré"),
  stock: z.coerce.number().int("Le stock doit être un entier.").min(0, "Le stock ne peut pas être négatif.").max(1_000_000),
  active: z.string().optional().transform((value) => value === "on"),
  tone: z.enum(TONES),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || /^https:\/\//i.test(value), "L'adresse de l'image doit commencer par https://")
    .transform((value) => value || null),
  sku: z.string().trim().max(60).transform((value) => value || null),
});

export async function saveProductAction(_previous: AdminFormState, formData: FormData): Promise<AdminFormState> {
  await requireAdmin();
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { ...raw };

  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values };
  }

  const data = parsed.data;
  if (data.compareAtCents != null && data.compareAtCents <= data.priceCents) {
    return { errors: { compareAtCents: "Le prix barré doit être supérieur au prix." }, values };
  }
  const input: ProductInput = { ...data, slug: data.slug || undefined };

  const db = await getDb();
  const id = Number(raw.id);
  if (Number.isInteger(id) && id > 0) {
    const updated = await updateProduct(db, id, input);
    if (!updated) return { message: "Produit introuvable.", values };
    redirect(`/admin/produits?enregistre=${updated.id}`);
  }
  const created = await createProduct(db, input);
  redirect(`/admin/produits?enregistre=${created.id}`);
}

export async function toggleProductAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (Number.isInteger(id) && id > 0) await setProductActive(await getDb(), id, formData.get("active") === "1");
  redirect("/admin/produits");
}

const categorySchema = z.object({
  name: z.string().trim().min(2, "Le nom est obligatoire.").max(80),
  description: z.string().trim().max(300),
  position: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function saveCategoryAction(_previous: AdminFormState, formData: FormData): Promise<AdminFormState> {
  await requireAdmin();
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values: raw };
  }
  const db = await getDb();
  const id = Number(raw.id);
  if (Number.isInteger(id) && id > 0) await updateCategory(db, id, parsed.data);
  else await createCategory(db, parsed.data);
  redirect("/admin/categories?enregistre=1");
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (Number.isInteger(id) && id > 0) await deleteCategory(await getDb(), id);
  redirect("/admin/categories");
}

type OrderAdminAction = "fulfill" | "cancel" | "refund" | "manual-pay";

export async function orderAdminAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const action = String(formData.get("action") ?? "") as OrderAdminAction;
  const db = await getDb();

  if (/^[0-9a-f-]{36}$/i.test(orderId)) {
    if (action === "fulfill") await fulfillOrder(db, orderId);
    else if (action === "cancel") await cancelOrder(db, orderId);
    else if (action === "refund") await markOrderRefunded(db, orderId);
    else if (action === "manual-pay") await markOrderPaidManually(db, orderId, String(formData.get("note") ?? ""));
  }
  redirect(`/admin/commandes/${orderId}`);
}

export async function setCurrencyRateAction(_previous: AdminFormState, formData: FormData): Promise<AdminFormState> {
  await requireAdmin();
  const code = String(formData.get("code") ?? "").toUpperCase();
  const rawRate = String(formData.get("rate") ?? "");
  const active = formData.get("active") === "on";
  const values = { code, rate: rawRate, active: active ? "on" : "" };

  const db = await getDb();
  const rateMicros = parseRateInput(rawRate);
  if (rawRate.trim() !== "" && rateMicros == null) {
    return { errors: { rate: "Taux invalide : un nombre positif, jusqu'à 6 décimales." }, values };
  }
  // Champ laissé vide : on garde le taux déjà enregistré plutôt que de le remettre à zéro.
  const finalRate = rateMicros ?? (await getCurrency(db, code))?.rateMicros ?? 0;

  try {
    await setCurrencyRate(db, code, { rateMicros: finalRate, active });
  } catch (error) {
    if (error instanceof MissingRateError) return { errors: { rate: error.message }, values };
    throw error;
  }
  redirect("/admin/devises?enregistre=1");
}
