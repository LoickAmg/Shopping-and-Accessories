"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { CATEGORY_FAMILIES, CONDITIONS, DEPARTMENTS, USER_ROLES, WEAR_GRADES } from "@/db/schema";
import { parseRateInput } from "@/lib/currency";
import { isAllowedImageUrl } from "@/lib/image-url";
import { parseMoneyInput } from "@/lib/money";
import { ROLE_LABELS, can } from "@/lib/roles";
import { parseVariantRows } from "@/lib/variant-form";
import { MissingRateError, getCurrency, setCurrencyRate } from "@/server/currency";
import {
  createCategory,
  InvalidVariantsError,
  createProduct,
  deleteCategory,
  describeProductChanges,
  duplicateProduct,
  getProductForAdmin,
  setProductActive,
  updateCategory,
  updateProduct,
} from "@/server/admin";
import type { ProductInput } from "@/server/admin";
import { logAction } from "@/server/audit";
import { requireAdmin, requireStaff } from "@/server/guard";
import { cancelOrder, fulfillOrder, getOrder, markOrderPaidManually, markOrderRefunded } from "@/server/orders";
import { sendOrderShipped } from "@/server/mailer";
import { adjustStock } from "@/server/stock";
import type { StockChange } from "@/server/stock";
import { setUserRole, setUserSuspended } from "@/server/users";

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
  const actor = await requireStaff("catalogue");
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
      const before = await getProductForAdmin(db, id);
      const updated = before && (await updateProduct(db, id, input, actor.id));
      if (!before || !updated) return { message: "Produit introuvable.", values };
      savedId = updated.id;
      const changes = describeProductChanges(before, input);
      if (changes.length > 0) {
        await logAction(db, actor, "product.update", { type: "product", id: savedId }, `${updated.name} : ${changes.join(", ")}`);
      }
    } else {
      const created = await createProduct(db, input, actor.id);
      savedId = created.id;
      await logAction(db, actor, "product.create", { type: "product", id: savedId }, created.name);
    }
  } catch (error) {
    if (error instanceof InvalidVariantsError) return { errors: { variants: error.message }, values };
    throw error;
  }
  redirect(`/admin/produits?enregistre=${savedId}`);
}

export async function toggleProductAction(formData: FormData): Promise<void> {
  const actor = await requireStaff("catalogue");
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  if (Number.isInteger(id) && id > 0) {
    const db = await getDb();
    const product = await getProductForAdmin(db, id);
    if (product) {
      await setProductActive(db, id, active);
      await logAction(db, actor, active ? "product.restore" : "product.archive", { type: "product", id }, product.name);
    }
  }
  redirect(safeAdminReturn(formData.get("retour"), "/admin/produits"));
}

/** Retour après une action de liste : seulement vers une page du back-office (jamais une adresse extérieure). */
function safeAdminReturn(value: FormDataEntryValue | null, fallback: string): string {
  const path = typeof value === "string" ? value : "";
  return /^\/admin(?:\/[\w\-/]*)?(?:\?[\w\-=&%.+]*)?$/.test(path) ? path : fallback;
}

export async function duplicateProductAction(formData: FormData): Promise<void> {
  const actor = await requireStaff("catalogue");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) redirect("/admin/produits");
  const db = await getDb();
  const copy = await duplicateProduct(db, id);
  if (!copy) redirect("/admin/produits");
  await logAction(db, actor, "product.duplicate", { type: "product", id: copy.id }, `${copy.name} (depuis le produit n° ${id})`);
  redirect(`/admin/produits/${copy.id}?copie=1`);
}

/** Nombre maximal de lignes de stock enregistrées en une fois (une page de la liste). */
const MAX_STOCK_LINES = 200;

/**
 * Enregistre la page « Stock » : chaque ligne envoie `stock_<id>` (saisi) et
 * `orig_<id>` (affiché à l'ouverture). Seules les lignes modifiées sont
 * appliquées, en écart, pour ne jamais effacer une vente passée entre-temps.
 */
export async function saveStockAction(formData: FormData): Promise<void> {
  const actor = await requireStaff("catalogue");
  const changes: StockChange[] = [];
  let invalid = 0;
  for (const [key, value] of formData.entries()) {
    const match = /^stock_(\d{1,9})$/.exec(key);
    if (!match || changes.length >= MAX_STOCK_LINES) continue;
    const to = String(value).trim();
    const from = String(formData.get(`orig_${match[1]}`) ?? "").trim();
    if (to === from) continue;
    if (!/^\d{1,7}$/.test(to) || !/^\d{1,7}$/.test(from)) {
      invalid += 1;
      continue;
    }
    changes.push({ variantId: Number(match[1]), from: Number(from), to: Number(to) });
  }

  const db = await getDb();
  const result = await adjustStock(db, changes, actor.id);
  if (result.applied.length > 0) {
    const summary = result.applied.map((line) => `#${line.variantId} ${line.delta > 0 ? "+" : ""}${line.delta} (→ ${line.stock})`).join(", ");
    await logAction(db, actor, "stock.adjust", { type: "stock", id: result.applied.map((line) => line.variantId).join(",") }, `${result.applied.length} ligne(s) : ${summary}`);
  }
  revalidatePath("/admin/stock");
  const params = new URLSearchParams();
  params.set("enregistre", String(result.applied.length));
  if (result.rejected.length + invalid > 0) params.set("refuse", String(result.rejected.length + invalid));
  const back = safeAdminReturn(formData.get("retour"), "/admin/stock");
  redirect(`${back}${back.includes("?") ? "&" : "?"}${params.toString()}`);
}

const categorySchema = z.object({
  name: z.string().trim().min(2, "Le nom est obligatoire.").max(80),
  description: z.string().trim().max(300),
  family: z.enum(CATEGORY_FAMILIES, { error: "Choisissez une famille." }),
  position: z.coerce.number().int().min(0).max(1000).default(0),
});

export async function saveCategoryAction(_previous: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const actor = await requireStaff("catalogue");
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors, values: raw };
  }
  const db = await getDb();
  const id = Number(raw.id);
  if (Number.isInteger(id) && id > 0) {
    await updateCategory(db, id, parsed.data);
    await logAction(db, actor, "category.update", { type: "category", id }, parsed.data.name);
  } else {
    await createCategory(db, parsed.data);
    await logAction(db, actor, "category.create", { type: "category", id: parsed.data.name }, parsed.data.name);
  }
  redirect("/admin/categories?enregistre=1");
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const actor = await requireStaff("catalogue");
  const id = Number(formData.get("id"));
  if (Number.isInteger(id) && id > 0) {
    const db = await getDb();
    await deleteCategory(db, id);
    await logAction(db, actor, "category.delete", { type: "category", id }, String(formData.get("name") ?? `Rayon n° ${id}`).slice(0, 80));
  }
  redirect("/admin/categories");
}

type OrderAdminAction = "fulfill" | "cancel" | "refund" | "manual-pay";

export async function orderAdminAction(formData: FormData): Promise<void> {
  const actor = await requireStaff("commandes");
  const orderId = String(formData.get("orderId") ?? "");
  const action = String(formData.get("action") ?? "") as OrderAdminAction;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) redirect("/admin/commandes");
  // L'argent (encaissement manuel, remboursement) reste à l'administrateur.
  if ((action === "refund" || action === "manual-pay") && !can(actor.role, "paiements")) redirect(`/admin/commandes/${orderId}?interdit=1`);

  const db = await getDb();
  const order = await getOrder(db, orderId);
  if (!order) redirect("/admin/commandes");
  let done = false;
  let detail = `Commande n° ${order.number}`;
  if (action === "fulfill") {
    const trackingUrlRaw = String(formData.get("trackingUrl") ?? "").trim().slice(0, 300);
    const tracking = {
      carrier: String(formData.get("trackingCarrier") ?? "").trim().slice(0, 60),
      number: String(formData.get("trackingNumber") ?? "").trim().slice(0, 80),
      // Seules les adresses http(s) sont acceptées : un lien "javascript:" ne doit jamais atterrir dans un href.
      url: /^https?:\/\//i.test(trackingUrlRaw) ? trackingUrlRaw : "",
    };
    const shipped = await fulfillOrder(db, orderId, tracking);
    done = Boolean(shipped);
    if (shipped) {
      await sendOrderShipped(shipped, tracking);
      detail += tracking.number ? ` — ${tracking.carrier || "suivi"} ${tracking.number}` : "";
    }
  } else if (action === "cancel") done = await cancelOrder(db, orderId);
  else if (action === "refund") done = await markOrderRefunded(db, orderId);
  else if (action === "manual-pay") {
    const note = String(formData.get("note") ?? "").trim().slice(0, 80);
    const outcome = await markOrderPaidManually(db, orderId, note);
    done = outcome.outcome === "paid" || outcome.outcome === "paid_after_expiry";
    if (note) detail += ` — ${note}`;
  }
  if (done) await logAction(db, actor, `order.${action}`, { type: "order", id: orderId }, detail);
  redirect(`/admin/commandes/${orderId}`);
}

export async function setCurrencyRateAction(_previous: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const actor = await requireAdmin();
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
  await logAction(db, actor, "currency.update", { type: "currency", id: code }, `${code} : taux ${finalRate / 1_000_000}, ${active ? "active" : "inactive"}`);
  redirect("/admin/devises?enregistre=1");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function usersPage(params: Record<string, string>, back: FormDataEntryValue | null): string {
  const base = safeAdminReturn(back, "/admin/utilisateurs");
  const query = new URLSearchParams(params).toString();
  return `${base}${base.includes("?") ? "&" : "?"}${query}`;
}

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!UUID.test(userId) || !(USER_ROLES as readonly string[]).includes(role)) redirect("/admin/utilisateurs");

  const db = await getDb();
  const result = await setUserRole(db, actor.id, userId, role as (typeof USER_ROLES)[number]);
  if (!result.ok) {
    if (result.reason === "unchanged") redirect(usersPage({}, formData.get("retour")));
    redirect(usersPage({ erreur: result.reason }, formData.get("retour")));
  }
  await logAction(
    db,
    actor,
    "user.role",
    { type: "user", id: userId },
    `${result.user.email} : ${ROLE_LABELS[result.previous.role]} → ${ROLE_LABELS[result.user.role]}`,
  );
  redirect(usersPage({ enregistre: "1" }, formData.get("retour")));
}

export async function setUserSuspendedAction(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const suspend = formData.get("suspend") === "1";
  if (!UUID.test(userId)) redirect("/admin/utilisateurs");

  const db = await getDb();
  const result = await setUserSuspended(db, actor.id, userId, suspend);
  if (!result.ok) {
    if (result.reason === "unchanged") redirect(usersPage({}, formData.get("retour")));
    redirect(usersPage({ erreur: result.reason }, formData.get("retour")));
  }
  await logAction(db, actor, suspend ? "user.suspend" : "user.reactivate", { type: "user", id: userId }, result.user.email);
  redirect(usersPage({ enregistre: "1" }, formData.get("retour")));
}
