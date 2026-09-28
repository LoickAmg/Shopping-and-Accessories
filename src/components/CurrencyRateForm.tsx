"use client";

import { useActionState } from "react";

import { setCurrencyRateAction } from "@/app/actions/admin";
import type { AdminFormState } from "@/app/actions/admin";

const INITIAL: AdminFormState = {};

export function CurrencyRateForm({
  code,
  baseCode,
  rate,
  active,
}: {
  code: string;
  baseCode: string;
  rate: string;
  active: boolean;
}) {
  const [state, action, pending] = useActionState(setCurrencyRateAction, INITIAL);
  const errors = state.errors ?? {};

  return (
    <form action={action} className="currency-row">
      <input type="hidden" name="code" value={code} />
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor={`rate-${code}`}>
          1 {baseCode} = combien de {code} ?
        </label>
        <input
          id={`rate-${code}`}
          name="rate"
          inputMode="decimal"
          placeholder="ex : 0.0016"
          defaultValue={state.values?.rate ?? rate}
          aria-invalid={Boolean(errors.rate)}
          aria-describedby={errors.rate ? `rate-${code}-error` : undefined}
        />
        {errors.rate && (
          <p id={`rate-${code}-error`} className="field-error">
            {errors.rate}
          </p>
        )}
      </div>
      <label style={{ fontWeight: 400 }}>
        <input type="checkbox" name="active" defaultChecked={active} /> Proposer {code} aux visiteurs
      </label>
      <button type="submit" className="button button-quiet button-small" disabled={pending}>
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
