"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { CATEGORY_FAMILIES, CONDITIONS, DEPARTMENTS, WEAR_GRADES } from "@/db/schema";
import { parseRateInput } from "@/lib/currency";
import { isAllowedImageUrl } from "@/lib/image-url";
import { parseMoneyInput } from "@/lib/money";
import { parseVariantRows } from "@/lib/variant-form";
import { MissingRateError, getCurrency, setCurrencyRate } from "@/server/currency";
import {
  createCategory,
  InvalidVariantsError,
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

/** Adresse d'image facultative : chemin du site ou https. */
const imageField = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value === "" || isAllowedImageUrl(value), "L'image doit être un chemin du site (/assets/…) ou une adresse en https://");

const MAX_GALLERY = 8;

const productSchema = z.object({
  name: z.string().trim().min(2, "Le nom est obligatoire.").max(160),
  slug: z.string().trim().max(160).optional(),
  summary: z.string().trim().max(300),
  description: z.string().trim().max(5000),
  categoryId: z.string().transform((value) => (value === "" ? null : Number(value))),
  priceCents: requiredPrice("Le prix"),
  compareAtCents: optionalPrice("Le prix barré"),
  active: z.string().optional().transform((value) => value === "on"),
  department: z.enum(DEPARTMENTS, { error: "Choisissez un univers." }),
  condition: z.enum(CONDITIONS, { error: "Choisissez un état." }),
  wearGrade: z
    .string()
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value == null || (WEAR_GRADES as readonly string[]).includes(value), "État d'usure inconnu.")
    .transform((value) => value as (typeof WEAR_GRADES)[number] | null),
  defects: z.string().trim().max(600).optional().default(""),
  material: z.string().trim().max(80).optional().default(""),
  tone: z.enum(TONES),
  imageUrl: imageField.transform((value) => value || null),
  gallery: z
    .string()
    .optional()
    .default("")
    .transform((value) => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
    .refine((urls) => urls.length <= MAX_GALLERY, `${MAX_GALLERY} photos supplémentaires au maximum.`)
    .refine((urls) => urls.every((url) => url.length <= 500 && isAllowedImageUrl(url)), "Chaque photo doit être un chemin du site (/assets/…) ou une adresse en https://, une par ligne."),
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
  if (data.condition === "seconde_main" && !data.wearGrade) {
    return { errors: { wearGrade: "Indiquez l'état d'usure de la pièce." }, values };
  }
  const { variants, error: variantError } = parseVariantRows(raw);
  if (variantError) return { errors: { variants: variantError }, values };
  const input: ProductInput = { ...data, slug: data.slug || undefined, variants };

  const db = await getDb();
  const id = Number(raw.id);
  let savedId: number;
  try {
    if (Number.isInteger(id) && id > 0) {
      const updated = await updateProduct(db, id, input);
      if (!updated) return { message: "Produit introuvable.", values };
      savedId = updated.id;
    } else {
      savedId = (await createProduct(db, input)).id;
    }
  } catch (error) {
    if (error instanceof InvalidVariantsError) return { errors: { variants: error.message }, values };
    throw error;
  }
  redirect(`/admin/produits?enregistre=${savedId}`);
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
  family: z.enum(CATEGORY_FAMILIES, { error: "Choisissez une famille." }),
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
