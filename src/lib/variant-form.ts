import type { VariantInput } from "@/server/admin";

/**
 * Lecture des lignes de déclinaison du formulaire produit. Ce module est à part
 * des actions serveur : un fichier `"use server"` ne peut exporter que des
 * fonctions asynchrones, et ce code est testé directement.
 */

/** Nombre maximal de lignes de déclinaison lues dans un formulaire (le formulaire n'en propose pas autant). */
export const MAX_VARIANT_ROWS = 60;

/**
 * Lit les lignes de déclinaison du formulaire : `variant_size_<n>`,
 * `variant_color_<n>`, `variant_stock_<n>`, `variant_sku_<n>`, `variant_id_<n>`.
 * Une ligne entièrement vide est ignorée ; un stock qui n'est pas un entier
 * positif arrête la lecture avec un message.
 */
export function parseVariantRows(raw: Record<string, string>): { variants: VariantInput[]; error?: string } {
  const indexes = new Set<number>();
  for (const key of Object.keys(raw)) {
    const match = /^variant_(?:size|color|stock|sku|id)_(\d{1,3})$/.exec(key);
    if (match && Number(match[1]) < MAX_VARIANT_ROWS) indexes.add(Number(match[1]));
  }
  const variants: VariantInput[] = [];
  for (const index of [...indexes].sort((a, b) => a - b)) {
    const size = (raw[`variant_size_${index}`] ?? "").trim().slice(0, 30);
    const color = (raw[`variant_color_${index}`] ?? "").trim().slice(0, 40);
    const sku = (raw[`variant_sku_${index}`] ?? "").trim().slice(0, 60);
    const stockRaw = (raw[`variant_stock_${index}`] ?? "").trim();
    if (!size && !color && !sku && !stockRaw) continue;
    const stock = Number(stockRaw);
    if (!/^\d+$/.test(stockRaw) || stock > 1_000_000) {
      return { variants, error: `Stock invalide pour la déclinaison ${size || color || index + 1} : nombre entier positif attendu.` };
    }
    const id = Number(raw[`variant_id_${index}`]);
    variants.push({ id: Number.isInteger(id) && id > 0 ? id : undefined, size, color, sku: sku || null, stock });
  }
  return { variants };
}
