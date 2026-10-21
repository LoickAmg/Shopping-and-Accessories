"use client";

import { useActionState } from "react";

import { requestPasswordResetAction } from "@/app/actions/auth";
import type { AuthState } from "@/app/actions/auth";

const INITIAL: AuthState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, INITIAL);
  const errors = state.errors ?? {};
  const values = state.values ?? {};
  const sent = Boolean(state.message) && !errors.email;

  return (
    <form action={action} className="form-narrow stack" noValidate>
      {state.message && (
        <p className={`notice ${sent ? "notice-ok" : "notice-error"}`} role="status">
          {state.message}
        </p>
      )}

      {!sent && (
        <>
          <div className="field">
            <label htmlFor="email">Adresse e-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={values.email}
              required
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && (
              <p id="email-error" className="field-error">
                {errors.email}
              </p>
            )}
          </div>

          <div className="actions">
            <button type="submit" className="button" disabled={pending}>
              {pending ? "Envoi…" : "Envoyer le lien"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
