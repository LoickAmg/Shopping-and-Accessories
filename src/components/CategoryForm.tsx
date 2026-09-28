"use client";

import { useActionState } from "react";

import { saveCategoryAction } from "@/app/actions/admin";
import type { AdminFormState } from "@/app/actions/admin";

const INITIAL: AdminFormState = {};

export function CategoryForm({ initial }: { initial: { id?: number; name: string; description: string; position: number } }) {
  const [state, action, pending] = useActionState(saveCategoryAction, INITIAL);
  const errors = state.errors ?? {};
  const prefix = initial.id ?? "new";

  return (
    <form action={action} className="stack" noValidate>
      {initial.id != null && <input type="hidden" name="id" value={initial.id} />}
      <div className="field-row">
        <div className="field">
          <label htmlFor={`name-${prefix}`}>Nom</label>
          <input id={`name-${prefix}`} name="name" defaultValue={initial.name} required aria-invalid={Boolean(errors.name)} />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor={`position-${prefix}`}>Ordre</label>
          <input id={`position-${prefix}`} name="position" type="number" min={0} defaultValue={initial.position} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`description-${prefix}`}>Description</label>
        <input id={`description-${prefix}`} name="description" defaultValue={initial.description} maxLength={300} />
      </div>
      <button type="submit" className="button button-quiet button-small" disabled={pending}>
        {initial.id != null ? "Enregistrer" : "Ajouter le rayon"}
      </button>
    </form>
  );
}
