"use client";

import { useActionState } from "react";

import { resetPasswordAction } from "@/app/actions/auth";
import type { AuthState } from "@/app/actions/auth";

const INITIAL: AuthState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, INITIAL);
  const errors = state.errors ?? {};

  return (
    <form action={action} className="form-narrow stack" noValidate>
      {state.message && (
        <p className="notice notice-error" role="alert">
          {state.message}
        </p>
      )}
      <input type="hidden" name="jeton" value={token} />

      <div className="field">
        <label htmlFor="password">Nouveau mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : "password-hint"}
        />
        {!errors.password && (
          <p id="password-hint" className="field-hint">
            10 caractères au minimum.
          </p>
        )}
        {errors.password && (
          <p id="password-error" className="field-error">
            {errors.password}
          </p>
        )}
      </div>

      <div className="actions">
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Un instant…" : "Changer mon mot de passe"}
        </button>
      </div>
    </form>
  );
}
