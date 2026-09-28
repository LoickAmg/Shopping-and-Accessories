"use client";

import { useActionState } from "react";

import { saveProductAction } from "@/app/actions/admin";
import type { AdminFormState } from "@/app/actions/admin";

export interface ProductFormValues {
  id?: number;
  name: string;
  slug: string;
  summary: string;
  description: string;
  categoryId: string;
  price: string;
  compareAt: string;
  stock: string;
  active: boolean;
  tone: string;
  imageUrl: string;
  sku: string;
}

interface Props {
  initial: ProductFormValues;
  categories: { id: number; name: string }[];
  currencyCode: string;
  exponent: number;
}

const TONES = [
  { id: "t1", label: "Sable" },
  { id: "t2", label: "Sauge" },
  { id: "t3", label: "Argile" },
  { id: "t4", label: "Ardoise" },
  { id: "t5", label: "Laiton" },
  { id: "t6", label: "Lichen" },
];

const INITIAL: AdminFormState = {};

export function ProductForm({ initial, categories, currencyCode, exponent }: Props) {
  const [state, action, pending] = useActionState(saveProductAction, INITIAL);
  const errors = state.errors ?? {};
  const v = state.values;

  const text = (name: keyof ProductFormValues, formName = name as string) => (v ? (v[formName] ?? "") : String(initial[name] ?? ""));
  const err = (name: string) =>
    errors[name] ? (
      <p id={`${name}-error`} className="field-error">
        {errors[name]}
      </p>
    ) : null;
  const invalid = (name: string) => ({ "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `${name}-error` : undefined });

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

      <div className="field-row">
        <div className="field">
          <label htmlFor="categoryId">Rayon</label>
          <select id="categoryId" name="categoryId" defaultValue={text("categoryId")}>
            <option value="">Aucun</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="stock">Stock</label>
          <input id="stock" name="stock" type="number" min={0} step={1} defaultValue={text("stock")} required {...invalid("stock")} />
          {err("stock")}
        </div>
      </div>

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

      <div className="field-row">
        <div className="field">
          <label htmlFor="tone">Teinte de la vignette</label>
          <select id="tone" name="tone" defaultValue={text("tone")}>
            {TONES.map((tone) => (
              <option key={tone.id} value={tone.id}>
                {tone.label}
              </option>
            ))}
          </select>
          <p className="field-hint">Utilisée tant qu&apos;aucune photo n&apos;est renseignée.</p>
        </div>
        <div className="field">
          <label htmlFor="sku">Référence (facultatif)</label>
          <input id="sku" name="sku" defaultValue={text("sku")} {...invalid("sku")} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="imageUrl">Adresse de la photo (facultatif)</label>
        <input id="imageUrl" name="imageUrl" type="url" placeholder="https://…" defaultValue={text("imageUrl")} {...invalid("imageUrl")} />
        {err("imageUrl")}
      </div>

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
