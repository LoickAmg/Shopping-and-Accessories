import { asc } from "drizzle-orm";

import type { Db } from "@/db/client";
import { CONDITIONS, DEPARTMENTS, WEAR_GRADES, categories } from "@/db/schema";
import type { Condition, Department, WearGrade } from "@/db/schema";
import { CONDITION_LABELS, DEPARTMENT_LABELS, FAMILY_LABELS, WEAR_GRADE_LABELS } from "@/lib/taxonomy";

import { createProduct, getProductForAdmin, listProductsForAdmin, updateProduct } from "./admin";
import type { ProductInput, VariantInput } from "./admin";
import { readSpreadsheet, writeXlsx } from "./spreadsheet";
import type { Cell, SheetSpec } from "./spreadsheet";

/**
 * Export et import du catalogue au format Excel (.xlsx) : une ligne par
 * déclinaison (taille/couleur), pour que le stock se corrige directement dans
 * le tableur. Une feuille « Lisez-moi » rappelle les règles, et une feuille
 * « Rayons » liste les rayons disponibles pour la colonne Rayon.
 */

const SHEET_NAME = "Produits";

export const COLUMNS = [
  "Identifiant",
  "Nom",
  "Résumé",
  "Description",
  "Rayon",
  "Univers",
  "État",
  "État d'usure",
  "Défauts",
  "Matière",
  "Prix",
  "Prix barré",
  "Taille",
  "Couleur",
  "Stock",
  "Référence (taille)",
  "Référence (modèle)",
  "Photo principale",
  "Photos supplémentaires",
  "En vente",
] as const;

const COLUMN_INDEX = Object.fromEntries(COLUMNS.map((name, index) => [name, index])) as Record<(typeof COLUMNS)[number], number>;

function cell(value: string | number | boolean | null | undefined): Cell {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  return value;
}

/** Construit le classeur d'export : une ligne par déclinaison, triée comme la liste de l'administration. */
export async function buildProductWorkbook(db: Db, filter: Parameters<typeof listProductsForAdmin>[1] = {}): Promise<Uint8Array> {
  const [{ rows: listed }, categoryRows] = await Promise.all([
    listProductsForAdmin(db, { ...filter, page: undefined }),
    db.select().from(categories).orderBy(asc(categories.position), asc(categories.name)),
  ]);

  const dataRows: Cell[][] = [];
  for (const { product } of listed) {
    const full = await getProductForAdmin(db, product.id);
    if (!full) continue;
    const categoryName = categoryRows.find((category) => category.id === full.categoryId)?.name ?? "";
    const variants = full.variants.length > 0 ? full.variants : [{ id: undefined, size: "", color: "", sku: null, stock: 0, position: 0, active: true, productId: full.id }];
    for (const variant of variants) {
      dataRows.push([
        cell(full.id),
        cell(full.name),
        cell(full.summary),
        cell(full.description),
        cell(categoryName),
        cell(DEPARTMENT_LABELS[full.department]),
        cell(CONDITION_LABELS[full.condition]),
        cell(full.wearGrade ? WEAR_GRADE_LABELS[full.wearGrade] : ""),
        cell(full.defects),
        cell(full.material),
        cell(full.priceCents / 100),
        cell(full.compareAtCents != null ? full.compareAtCents / 100 : ""),
        cell(variant.size),
        cell(variant.color),
        cell(variant.stock),
        cell(variant.sku),
        cell(full.sku),
        cell(full.imageUrl),
        cell(full.gallery.join(" | ")),
        cell(full.active),
      ]);
    }
  }

  const productSheet: SheetSpec = {
    name: SHEET_NAME,
    header: true,
    widths: [10, 26, 22, 30, 16, 10, 12, 12, 20, 14, 10, 10, 10, 14, 16, 16, 24, 24, 30, 8],
    rows: [[...COLUMNS], ...dataRows],
  };

  const readmeSheet: SheetSpec = {
    name: "Lisez-moi",
    wrap: true,
    widths: [100],
    boldRows: [0, 3, 10, 16],
    rows: [
      ["Comment utiliser ce fichier"],
      [""],
      ["Une ligne = une taille ou une couleur d'un produit (une « déclinaison »). Un sac ou un collier, sans taille, tient sur une seule ligne."],
      ["Pour corriger un produit existant"],
      ["Gardez la colonne « Identifiant » telle quelle : c'est elle qui retrouve le produit, pas le nom. Modifiez les autres colonnes (prix, stock, textes…), puis réimportez le fichier."],
      ["Pour ajouter une nouvelle taille ou couleur à un produit existant"],
      ["Copiez une ligne de ce produit, gardez son Identifiant, changez la Taille ou la Couleur et le Stock."],
      ["Pour créer un nouveau produit"],
      ["Laissez la colonne « Identifiant » vide. Donnez-lui un nom, et répétez les mêmes informations (nom, rayon, prix…) sur chaque ligne de taille ou de couleur de ce produit."],
      [""],
      ["Valeurs acceptées"],
      [`Univers : ${DEPARTMENTS.map((value) => DEPARTMENT_LABELS[value]).join(", ")}`],
      [`État : ${CONDITIONS.map((value) => CONDITION_LABELS[value]).join(", ")}`],
      [`État d'usure (seulement si État = « ${CONDITION_LABELS.seconde_main} ») : ${WEAR_GRADES.map((value) => WEAR_GRADE_LABELS[value]).join(", ")}`],
      ["Rayon : voir la feuille « Rayons » ; laissez vide pour aucun rayon."],
      ["Prix et prix barré : nombres, avec un point ou une virgule pour les décimales. Laissez le prix barré vide s'il n'y en a pas."],
      ["En vente : « Oui » ou « Non »."],
      [""],
      ["Ce qui n'est pas importé"],
      ["Les photos ne s'ajoutent pas depuis ce fichier : envoyez-les depuis la fiche produit, dans l'administration. Les colonnes Photo principale et Photos supplémentaires sont affichées à titre d'information seulement."],
    ],
  };

  const categorySheet: SheetSpec = {
    name: "Rayons",
    header: true,
    widths: [26, 16],
    rows: [["Nom du rayon", "Famille"], ...categoryRows.map((category) => [category.name, FAMILY_LABELS[category.family]])],
  };

  return writeXlsx([productSheet, readmeSheet, categorySheet]);
}

export interface ImportLineError {
  line: number;
  message: string;
}

export interface ImportSummary {
  created: number;
  updated: number;
  /** Lignes lues mais ignorées (vides, ou identifiant inconnu). */
  skipped: number;
  errors: ImportLineError[];
}

const REVERSE_DEPARTMENT = new Map(DEPARTMENTS.map((value) => [DEPARTMENT_LABELS[value].toLowerCase(), value]));
const REVERSE_CONDITION = new Map(CONDITIONS.map((value) => [CONDITION_LABELS[value].toLowerCase(), value]));
const REVERSE_WEAR_GRADE = new Map(WEAR_GRADES.map((value) => [WEAR_GRADE_LABELS[value].toLowerCase(), value]));
const MAX_IMPORT_ROWS = 2000;

function parseMoney(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function parseBool(raw: string, fallback: boolean): boolean {
  const value = raw.trim().toLowerCase();
  if (["oui", "yes", "true", "1", "vrai"].includes(value)) return true;
  if (["non", "no", "false", "0", "faux"].includes(value)) return false;
  return fallback;
}

interface DraftLine {
  line: number;
  id?: number;
  values: Record<(typeof COLUMNS)[number], string>;
}

/**
 * Groupe les lignes du tableur par produit (identifiant existant, sinon le nom
 * d'une fiche sans identifiant, dans l'ordre d'apparition) pour reconstituer un
 * produit et toutes ses déclinaisons avant de l'enregistrer.
 */
function groupLines(rows: string[][]): DraftLine[][] {
  const header = (rows[0] ?? []).map((value) => value.trim());
  const indexFor = (name: string) => {
    const found = header.findIndex((value) => value.toLowerCase() === name.toLowerCase());
    return found >= 0 ? found : COLUMN_INDEX[name as (typeof COLUMNS)[number]];
  };
  const positions = Object.fromEntries(COLUMNS.map((name) => [name, indexFor(name)])) as Record<(typeof COLUMNS)[number], number>;

  const groups = new Map<string, DraftLine[]>();
  const order: string[] = [];
  let newProductCounter = 0;

  for (let rowIndex = 1; rowIndex < rows.length && rowIndex <= MAX_IMPORT_ROWS; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    if (row.every((value) => !value || !value.trim())) continue;
    const values = Object.fromEntries(COLUMNS.map((name) => [name, (row[positions[name]] ?? "").trim()])) as Record<(typeof COLUMNS)[number], string>;
    const idRaw = values.Identifiant.trim();
    const id = idRaw && /^\d+$/.test(idRaw) ? Number(idRaw) : undefined;
    // Sans identifiant : un nouveau groupe par nom rencontré (permet plusieurs tailles d'un même nouveau produit).
    const key = id != null ? `id:${id}` : `new:${values.Nom.trim().toLowerCase() || `#${++newProductCounter}`}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push({ line: rowIndex + 1, id, values });
  }
  return order.map((key) => groups.get(key)!);
}

export interface ImportOptions {
  /** Un produit qui existe déjà dans le fichier mais n'est plus dedans n'est jamais touché : l'import n'archive rien. */
  dryRun?: boolean;
}

/** Importe un classeur (ou CSV) de produits : crée, met à jour, et remonte une erreur par ligne fautive. */
export async function importProductSheet(db: Db, bytes: Uint8Array, actorId: string | null, options: ImportOptions = {}): Promise<ImportSummary> {
  const normalizedActor = actorId || null;
  const rows = readSpreadsheet(bytes, SHEET_NAME);
  if (rows.length === 0) throw new Error("Le fichier est vide.");
  const groups = groupLines(rows);
  if (groups.length > MAX_IMPORT_ROWS) throw new Error(`${MAX_IMPORT_ROWS} lignes au maximum par import.`);

  const categoryRows = await db.select().from(categories);
  const categoryByName = new Map(categoryRows.map((category) => [category.name.trim().toLowerCase(), category.id]));

  const summary: ImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const group of groups) {
    const first = group[0];
    try {
      const existing = first.id != null ? await getProductForAdmin(db, first.id) : undefined;
      if (first.id != null && !existing) {
        summary.errors.push({ line: first.line, message: `Identifiant ${first.id} inconnu : la ligne est ignorée.` });
        summary.skipped += group.length;
        continue;
      }

      const head = first.values;
      const name = head.Nom.trim();
      if (!existing && !name) {
        summary.errors.push({ line: first.line, message: "Nom obligatoire pour un nouveau produit." });
        summary.skipped += group.length;
        continue;
      }

      const departmentLabel = head.Univers.trim().toLowerCase();
      const department = (departmentLabel ? REVERSE_DEPARTMENT.get(departmentLabel) : undefined) ?? existing?.department ?? ("femme" as Department);
      if (departmentLabel && !REVERSE_DEPARTMENT.has(departmentLabel)) {
        summary.errors.push({ line: first.line, message: `Univers « ${head.Univers} » inconnu.` });
        summary.skipped += group.length;
        continue;
      }
      const conditionLabel = head["État"].trim().toLowerCase();
      const condition = (conditionLabel ? REVERSE_CONDITION.get(conditionLabel) : undefined) ?? existing?.condition ?? ("neuf" as Condition);
      if (conditionLabel && !REVERSE_CONDITION.has(conditionLabel)) {
        summary.errors.push({ line: first.line, message: `État « ${head["État"]} » inconnu.` });
        summary.skipped += group.length;
        continue;
      }
      const wearLabel = head["État d'usure"].trim().toLowerCase();
      let wearGrade: WearGrade | null = existing?.wearGrade ?? null;
      if (condition === "seconde_main") {
        if (wearLabel && REVERSE_WEAR_GRADE.has(wearLabel)) wearGrade = REVERSE_WEAR_GRADE.get(wearLabel)!;
        else if (!wearGrade) {
          summary.errors.push({ line: first.line, message: "État d'usure obligatoire pour une pièce de friperie." });
          summary.skipped += group.length;
          continue;
        }
      } else wearGrade = null;

      const priceRaw = head.Prix.trim();
      const priceCents = priceRaw ? parseMoney(priceRaw) : existing?.priceCents;
      if (priceCents == null) {
        summary.errors.push({ line: first.line, message: `Prix « ${head.Prix} » invalide.` });
        summary.skipped += group.length;
        continue;
      }
      const compareRaw = head["Prix barré"].trim();
      const compareAtCents = compareRaw ? parseMoney(compareRaw) : null;
      if (compareRaw && compareAtCents == null) {
        summary.errors.push({ line: first.line, message: `Prix barré « ${head["Prix barré"]} » invalide.` });
        summary.skipped += group.length;
        continue;
      }
      if (compareAtCents != null && compareAtCents <= priceCents) {
        summary.errors.push({ line: first.line, message: "Le prix barré doit être supérieur au prix." });
        summary.skipped += group.length;
        continue;
      }

      let categoryId = existing?.categoryId ?? null;
      const categoryName = head.Rayon.trim();
      if (categoryName) {
        const found = categoryByName.get(categoryName.toLowerCase());
        if (!found) {
          summary.errors.push({ line: first.line, message: `Rayon « ${categoryName} » inconnu.` });
          summary.skipped += group.length;
          continue;
        }
        categoryId = found;
      } else if (first.values.Rayon !== undefined && categoryName === "" && head.Rayon === "") {
        categoryId = existing ? categoryId : null;
      }

      const variants: VariantInput[] = [];
      let variantError: string | null = null;
      for (const line of group) {
        const stockRaw = line.values.Stock.trim();
        const stock = stockRaw === "" ? 0 : Number(stockRaw);
        if (!Number.isInteger(stock) || stock < 0) {
          variantError = `Stock « ${line.values.Stock} » invalide (ligne ${line.line}).`;
          break;
        }
        const size = line.values.Taille.trim().slice(0, 30);
        const color = line.values.Couleur.trim().slice(0, 40);
        const variantId = line.id != null ? existing?.variants.find((v) => v.size.toLowerCase() === size.toLowerCase() && v.color.toLowerCase() === color.toLowerCase())?.id : undefined;
        variants.push({ id: variantId, size, color, sku: line.values["Référence (taille)"].trim() || null, stock, originalStock: variantId != null ? existing?.variants.find((v) => v.id === variantId)?.stock : undefined });
      }
      if (variantError) {
        summary.errors.push({ line: first.line, message: variantError });
        summary.skipped += group.length;
        continue;
      }
      if (variants.length === 0) variants.push({ size: "", color: "", sku: null, stock: 0 });

      const input: ProductInput = {
        name: name || existing!.name,
        summary: head.Résumé.trim() || existing?.summary || "",
        description: head.Description.trim() || existing?.description || "",
        categoryId,
        priceCents,
        compareAtCents,
        active: head["En vente"].trim() ? parseBool(head["En vente"], existing?.active ?? true) : (existing?.active ?? true),
        department,
        condition,
        wearGrade,
        defects: condition === "seconde_main" ? head.Défauts.trim() || existing?.defects || "" : "",
        material: head.Matière.trim() || existing?.material || "",
        tone: existing?.tone ?? "t1",
        imageUrl: existing?.imageUrl ?? null,
        gallery: existing?.gallery ?? [],
        sku: head["Référence (modèle)"].trim() || existing?.sku || null,
        variants,
      };

      if (options.dryRun) {
        if (existing) summary.updated += 1;
        else summary.created += 1;
        continue;
      }

      if (existing) {
        await updateProduct(db, existing.id, input, normalizedActor);
        summary.updated += 1;
      } else {
        await createProduct(db, input, normalizedActor);
        summary.created += 1;
      }
    } catch (error) {
      summary.errors.push({ line: first.line, message: error instanceof Error ? error.message : "Erreur inattendue." });
      summary.skipped += group.length;
    }
  }

  return summary;
}
