"use client";

import { useActionState, useState } from "react";

import { saveProductAction } from "@/app/actions/admin";
import type { AdminFormState } from "@/app/actions/admin";

export interface VariantRowValues {
  id?: number;
  size: string;
  color: string;
  stock: string;
  sku: string;
}

export interface ProductFormValues {
  id?: number;
  name: string;
  slug: string;
  summary: string;
  description: string;
  categoryId: string;
  price: string;
  compareAt: string;
  active: boolean;
  department: string;
  condition: string;
  wearGrade: string;
  defects: string;
  material: string;
  tone: string;
  imageUrl: string;
  gallery: string;
  sku: string;
  variants: VariantRowValues[];
}

interface Props {
  initial: ProductFormValues;
  categories: { id: number; name: string; family: string }[];
  currencyCode: string;
  exponent: number;
}

/** Fonds de carte (les six teintes historiques se ramènent à trois couleurs). */
const TONES = [
  { id: "t1", label: "Sable" },
  { id: "t2", label: "Rose poudré" },
  { id: "t3", label: "Camel" },
];
const TONE_ALIASES: Record<string, string> = { t4: "t2", t5: "t1", t6: "t3" };

const DEPARTMENTS = [
  { id: "femme", label: "Femme" },
  { id: "homme", label: "Homme" },
  { id: "enfant", label: "Enfant" },
  { id: "mixte", label: "Mixte" },
];

const CONDITIONS = [
  { id: "neuf", label: "Neuf" },
  { id: "seconde_main", label: "Friperie (seconde main)" },
  { id: "fin_de_serie", label: "Fin de série (déstockage)" },
];

const WEAR_GRADES = [
  { id: "comme_neuf", label: "Comme neuf" },
  { id: "tres_bon", label: "Très bon état" },
  { id: "bon", label: "Bon état" },
];

const FAMILY_LABELS: Record<string, string> = { vetements: "Vêtements", sacs: "Sacs", bijoux: "Bijoux", accessoires: "Accessoires" };

/** Raccourcis de grilles de tailles : chaque taille devient une ligne, stock à compléter. */
const PRESETS: { label: string; sizes: string[] }[] = [
  { label: "Tailles adultes XS–XXL", sizes: ["XS", "S", "M", "L", "XL", "XXL"] },
  { label: "Tailles enfant 2–14 ans", sizes: ["2 ans", "4 ans", "6 ans", "8 ans", "10 ans", "12 ans", "14 ans"] },
  { label: "Tailles de bague 50–60", sizes: ["50", "52", "54", "56", "58", "60"] },
];

const INITIAL: AdminFormState = {};

interface Row extends VariantRowValues {
  key: number;
}

let nextKey = 1;
const withKey = (row: VariantRowValues): Row => ({ ...row, key: nextKey++ });
const emptyRow = (): Row => withKey({ size: "", color: "", stock: "", sku: "" });

/** Après une erreur, le serveur renvoie le formulaire brut : on reconstruit les lignes de déclinaison. */
function rowsFromValues(values: Record<string, string>): Row[] {
  const indexes = new Set<number>();
  for (const key of Object.keys(values)) {
    const match = /^variant_(?:size|color|stock|sku|id)_(\d{1,3})$/.exec(key);
    if (match) indexes.add(Number(match[1]));
  }
  return [...indexes]
    .sort((a, b) => a - b)
    .map((index) =>
      withKey({
        id: Number(values[`variant_id_${index}`]) || undefined,
        size: values[`variant_size_${index}`] ?? "",
        color: values[`variant_color_${index}`] ?? "",
        stock: values[`variant_stock_${index}`] ?? "",
        sku: values[`variant_sku_${index}`] ?? "",
      }),
    );
}

export function ProductForm({ initial, categories, currencyCode, exponent }: Props) {
  const [state, action, pending] = useActionState(saveProductAction, INITIAL);
  const errors = state.errors ?? {};
  const v = state.values;

  const [rows, setRows] = useState<Row[]>(() => (initial.variants.length > 0 ? initial.variants.map(withKey) : [emptyRow()]));
  const [condition, setCondition] = useState(initial.condition);
  // Une erreur serveur réaffiche ce que l'administrateur avait saisi.
  const [restoredFrom, setRestoredFrom] = useState<Record<string, string> | undefined>(undefined);
  if (v && v !== restoredFrom) {
    setRestoredFrom(v);
    const restored = rowsFromValues(v);
    if (restored.length > 0) setRows(restored);
    if (v.condition) setCondition(v.condition);
  }

  const text = (name: Exclude<keyof ProductFormValues, "variants" | "active" | "id">, formName = name as string) =>
    v ? (v[formName] ?? "") : String(initial[name] ?? "");
  const err = (name: string) =>
    errors[name] ? (
      <p id={`${name}-error`} className="field-error">
        {errors[name]}
      </p>
    ) : null;
  const invalid = (name: string) => ({ "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `${name}-error` : undefined });

  const updateRow = (key: number, field: keyof VariantRowValues, value: string) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  const removeRow = (key: number) => setRows((current) => (current.length > 1 ? current.filter((row) => row.key !== key) : current));
  const applyPreset = (sizes: string[]) =>
    setRows((current) => {
      const existing = new Set(current.filter((row) => row.size).map((row) => row.size.toLowerCase()));
      // Une grille de tailles remplace la ligne « sans taille » : sinon un article fantôme sans taille resterait en vente.
      const kept = current.filter((row) => row.size || row.color);
      return [...kept, ...sizes.filter((size) => !existing.has(size.toLowerCase())).map((size) => withKey({ size, color: "", stock: "0", sku: "" }))];
    });
  const singleSize = () => setRows([withKey({ size: "", color: "", stock: rows[0]?.stock ?? "1", sku: "" })]);

  const tone = TONE_ALIASES[text("tone")] ?? text("tone");
  const secondHand = condition === "seconde_main";
  const families = [...new Set(categories.map((category) => category.family))];

  return (
    <form action={action} className="stack" noValidate>
      {state.message && (
        <p className="notice notice-error" role="alert">
          {state.message}
        </p>
      )}
      {initial.id != null && <input type="hidden" name="id" value={initial.id} />}

      <div className="field">
        <label htmlFor="name">Nom</label>
        <input id="name" name="name" defaultValue={text("name")} required {...invalid("name")} />
        <p className="field-hint">Ex. « Robe portefeuille, lin bleu ». Le texte après la virgule s&apos;affiche comme déclinaison.</p>
        {err("name")}
      </div>

      <div className="field">
        <label htmlFor="slug">Adresse dans l&apos;URL (facultatif)</label>
        <input id="slug" name="slug" defaultValue={text("slug")} {...invalid("slug")} />
        <p className="field-hint">Laissez vide pour la déduire du nom.</p>
      </div>

      <div className="field">
        <label htmlFor="summary">Résumé</label>
        <input id="summary" name="summary" defaultValue={text("summary")} maxLength={300} {...invalid("summary")} />
        {err("summary")}
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" defaultValue={text("description")} maxLength={5000} {...invalid("description")} />
        {err("description")}
      </div>

      <fieldset className="form-group">
        <legend>Classement</legend>
        <div className="field-row">
          <div className="field">
            <label htmlFor="department">Univers</label>
            <select id="department" name="department" defaultValue={text("department")} {...invalid("department")}>
              {DEPARTMENTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            {err("department")}
          </div>
          <div className="field">
            <label htmlFor="categoryId">Rayon</label>
            <select id="categoryId" name="categoryId" defaultValue={text("categoryId")}>
              <option value="">Aucun</option>
              {families.map((family) => (
                <optgroup key={family} label={FAMILY_LABELS[family] ?? family}>
                  {categories
                    .filter((category) => category.family === family)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="material">Matière (facultatif)</label>
          <input id="material" name="material" defaultValue={text("material")} maxLength={80} placeholder="Coton, lin, cuir, acier inoxydable, plaqué or…" />
        </div>
      </fieldset>

      <fieldset className="form-group">
        <legend>État</legend>
        <div className="field-row">
          <div className="field">
            <label htmlFor="condition">Type d&apos;article</label>
            <select id="condition" name="condition" value={condition} onChange={(event) => setCondition(event.target.value)} {...invalid("condition")}>
              {CONDITIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            {err("condition")}
          </div>
          {secondHand && (
            <div className="field">
              <label htmlFor="wearGrade">État d&apos;usure</label>
              <select id="wearGrade" name="wearGrade" defaultValue={text("wearGrade")} {...invalid("wearGrade")}>
                <option value="">Choisir…</option>
                {WEAR_GRADES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
              {err("wearGrade")}
            </div>
          )}
        </div>
        {secondHand && (
          <div className="field">
            <label htmlFor="defects">Défauts à signaler (facultatif)</label>
            <textarea id="defects" name="defects" defaultValue={text("defects")} maxLength={600} placeholder="Ex. légère trace sur la manche gauche, bouton remplacé." />
            <p className="field-hint">Affichés clairement sur la fiche : un acheteur bien informé ne retourne pas l&apos;article.</p>
          </div>
        )}
        {condition === "fin_de_serie" && (
          <p className="field-hint">Pensez au prix barré : la remise s&apos;affiche automatiquement, avec un badge « Fin de série ».</p>
        )}
      </fieldset>

      <fieldset className="form-group">
        <legend>Prix</legend>
        <div className="field-row">
          <div className="field">
            <label htmlFor="priceCents">Prix ({currencyCode})</label>
            <input id="priceCents" name="priceCents" inputMode="decimal" defaultValue={v ? (v.priceCents ?? "") : initial.price} required {...invalid("priceCents")} />
            <p className="field-hint">{exponent === 0 ? "En unités entières, sans décimale." : `Jusqu'à ${exponent} décimales.`}</p>
            {err("priceCents")}
          </div>
          <div className="field">
            <label htmlFor="compareAtCents">Prix barré (facultatif)</label>
            <input id="compareAtCents" name="compareAtCents" inputMode="decimal" defaultValue={v ? (v.compareAtCents ?? "") : initial.compareAt} {...invalid("compareAtCents")} />
            <p className="field-hint">Ancien prix, affiché barré. Doit être supérieur au prix.</p>
            {err("compareAtCents")}
          </div>
        </div>
      </fieldset>

      <fieldset className="form-group" aria-describedby={errors.variants ? "variants-error" : "variants-hint"}>
        <legend>Tailles, couleurs et stock</legend>
        <p className="field-hint" id="variants-hint">
          Une ligne par taille ou couleur, avec son stock. Pour un article sans taille (sac, collier) ou une pièce unique de friperie, gardez une seule ligne, taille vide.
        </p>
        <div className="variant-presets">
          {PRESETS.map((preset) => (
            <button key={preset.label} type="button" className="button button-quiet button-small" onClick={() => applyPreset(preset.sizes)}>
              + {preset.label}
            </button>
          ))}
          <button type="button" className="button button-quiet button-small" onClick={singleSize}>
            Taille unique
          </button>
        </div>
        <div className="variant-table" role="table" aria-label="Déclinaisons">
          <div className="variant-row variant-head" role="row">
            <span role="columnheader">Taille</span>
            <span role="columnheader">Couleur</span>
            <span role="columnheader">Stock</span>
            <span role="columnheader" className="variant-sku">
              Référence
            </span>
            <span role="columnheader">
              <span className="sr-only">Retirer</span>
            </span>
          </div>
          {rows.map((row, index) => (
            <div className="variant-row" role="row" key={row.key}>
              {row.id != null && <input type="hidden" name={`variant_id_${index}`} value={row.id} />}
              <input
                aria-label={`Taille, ligne ${index + 1}`}
                name={`variant_size_${index}`}
                value={row.size}
                maxLength={30}
                placeholder="—"
                onChange={(event) => updateRow(row.key, "size", event.target.value)}
              />
              <input
                aria-label={`Couleur, ligne ${index + 1}`}
                name={`variant_color_${index}`}
                value={row.color}
                maxLength={40}
                placeholder="—"
                onChange={(event) => updateRow(row.key, "color", event.target.value)}
              />
              <input
                aria-label={`Stock, ligne ${index + 1}`}
                name={`variant_stock_${index}`}
                value={row.stock}
                inputMode="numeric"
                placeholder="0"
                onChange={(event) => updateRow(row.key, "stock", event.target.value)}
              />
              <input
                aria-label={`Référence, ligne ${index + 1}`}
                className="variant-sku"
                name={`variant_sku_${index}`}
                value={row.sku}
                maxLength={60}
                placeholder="—"
                onChange={(event) => updateRow(row.key, "sku", event.target.value)}
              />
              <button
                type="button"
                className="link-button"
                onClick={() => removeRow(row.key)}
                disabled={rows.length <= 1}
                aria-label={`Retirer la ligne ${index + 1}${row.size ? ` (taille ${row.size})` : ""}`}
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="button button-quiet button-small" onClick={() => setRows((current) => [...current, emptyRow()])}>
          + Ajouter une ligne
        </button>
        {errors.variants && (
          <p id="variants-error" className="field-error" role="alert">
            {errors.variants}
          </p>
        )}
      </fieldset>

      <fieldset className="form-group">
        <legend>Photos et présentation</legend>
        <div className="field">
          <label htmlFor="imageUrl">Photo principale (facultatif)</label>
          {/* type="text" : un champ « url » refuserait les chemins du site comme /assets/sac.jpeg. */}
          <input
            id="imageUrl"
            name="imageUrl"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="/assets/robe.jpeg ou https://…"
            defaultValue={text("imageUrl")}
            {...invalid("imageUrl")}
            aria-describedby={errors.imageUrl ? "imageUrl-error imageUrl-hint" : "imageUrl-hint"}
          />
          <p className="field-hint" id="imageUrl-hint">
            Une photo du site (déposée dans <code>public/assets/</code>) ou une adresse en https://. Sur fond blanc, le vêtement paraît détouré.
          </p>
          {err("imageUrl")}
        </div>
        <div className="field">
          <label htmlFor="gallery">Photos supplémentaires (facultatif, une par ligne)</label>
          <textarea
            id="gallery"
            name="gallery"
            defaultValue={text("gallery")}
            spellCheck={false}
            placeholder={"/assets/robe-dos.jpeg\n/assets/robe-detail.jpeg"}
            {...invalid("gallery")}
          />
          <p className="field-hint">Dos, détails, porté, défauts éventuels : 8 au maximum.</p>
          {err("gallery")}
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="tone">Fond de la carte</label>
            <select id="tone" name="tone" defaultValue={tone}>
              {TONES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sku">Référence du modèle (facultatif)</label>
            <input id="sku" name="sku" defaultValue={text("sku")} {...invalid("sku")} />
          </div>
        </div>
      </fieldset>

      <div className="field">
        <label style={{ fontWeight: 400 }}>
          <input type="checkbox" name="active" defaultChecked={v ? v.active === "on" : initial.active} /> En vente (visible dans la boutique)
        </label>
      </div>

      <div className="actions">
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
