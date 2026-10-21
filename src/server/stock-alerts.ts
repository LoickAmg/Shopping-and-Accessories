import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";

import { store } from "@/config/store";
import type { Db } from "@/db/client";
import { productVariants, products, stockAlerts, users } from "@/db/schema";
import { siteUrl } from "@/payments/registry";
import { variantLabel } from "@/lib/taxonomy";

import { LOW_STOCK_THRESHOLD } from "./admin";
import type { Mailer } from "./mailer";
import { getMailer } from "./mailer";

/**
 * Alerte « stock bas » par e-mail, à l'équipe (gestionnaires et
 * administrateurs). L'information reste visible en permanence dans le tableau
 * de bord ; l'e-mail prévient sans avoir à aller la consulter. Une seule
 * alerte par déclinaison tant que le stock reste bas : elle repart dès que le
 * stock a été réapprovisionné au-dessus du seuil puis rebaisse.
 */

async function staffEmails(db: Db): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(and(inArray(users.role, ["manager", "admin"]), isNull(users.suspendedAt)));
  return rows.map((row) => row.email);
}

let lastCheck = 0;
/** Au plus une vérification toutes les dix minutes par processus : inutile de la refaire à chaque vente. */
const THROTTLE_MS = 10 * 60 * 1000;

/** À appeler après tout ce qui peut faire baisser un stock (vente, correction manuelle). Ne lève jamais d'erreur. */
export async function notifyLowStock(db: Db, options: { mailer?: Mailer; force?: boolean } = {}): Promise<void> {
  const now = Date.now();
  if (!options.force && now - lastCheck < THROTTLE_MS) return;
  lastCheck = now;
  try {
    await runLowStockCheck(db, options.mailer ?? getMailer());
  } catch (error) {
    lastCheck = 0;
    console.error("Vérification du stock bas en échec :", error);
  }
}

async function runLowStockCheck(db: Db, mailer: Mailer): Promise<void> {
  const low = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productName: products.name,
      size: productVariants.size,
      color: productVariants.color,
      stock: productVariants.stock,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(eq(products.active, true), eq(productVariants.active, true), gt(productVariants.stock, 0), lte(productVariants.stock, LOW_STOCK_THRESHOLD)));

  // Le stock est remonté au-dessus du seuil (ou la déclinaison a été retirée de la vente) : la prochaine baisse réalertera.
  const stillLow = new Set(low.map((row) => row.variantId));
  const alerted = await db.select({ variantId: stockAlerts.variantId }).from(stockAlerts);
  const toClear = alerted.filter((row) => !stillLow.has(row.variantId)).map((row) => row.variantId);
  if (toClear.length > 0) await db.delete(stockAlerts).where(inArray(stockAlerts.variantId, toClear));

  const alreadySent = new Set(toClear.length === alerted.length ? [] : alerted.filter((row) => stillLow.has(row.variantId)).map((row) => row.variantId));
  const toAlert = low.filter((row) => !alreadySent.has(row.variantId));
  if (toAlert.length === 0) return;

  const recipients = await staffEmails(db);
  if (recipients.length === 0) return;

  const lines = toAlert.map((row) => `- ${row.productName}${variantLabel(row) ? ` — ${variantLabel(row)}` : ""} : ${row.stock} restant${row.stock > 1 ? "s" : ""}`);
  const link = `${siteUrl()}/admin/stock?niveau=bas`;
  const text = [
    `${toAlert.length} article${toAlert.length > 1 ? "s" : ""} en stock bas (seuil : ${LOW_STOCK_THRESHOLD}) :`,
    "",
    ...lines,
    "",
    `Corriger le stock : ${link}`,
    "",
    store.name,
  ].join("\n");

  for (const email of recipients) {
    try {
      await mailer.send({ to: email, subject: `Stock bas — ${toAlert.length} article${toAlert.length > 1 ? "s" : ""}`, text });
    } catch (error) {
      console.error(`Alerte de stock bas non envoyée à ${email} :`, error);
    }
  }

  await db.insert(stockAlerts).values(toAlert.map((row) => ({ variantId: row.variantId }))).onConflictDoUpdate({ target: stockAlerts.variantId, set: { sentAt: new Date() } });
}
