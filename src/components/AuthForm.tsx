"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, registerAction } from "@/app/actions/auth";
import type { AuthState } from "@/app/actions/auth";

const INITIAL: AuthState = {};

export function AuthForm({ mode, returnTo }: { mode: "login" | "register"; returnTo: string }) {
  const [state, action, pending] = useActionState(mode === "login" ? loginAction : registerAction, INITIAL);
  const errors = state.errors ?? {};
  const values = state.values ?? {};
  const register = mode === "register";

  return (
    <form action={action} className="form-narrow stack" noValidate>
      {state.message && (
        <p className="notice notice-error" role="alert">
          {state.message}
        </p>
      )}
      <input type="hidden" name="retour" value={returnTo} />

      {register && (
        <div className="field">
          <label htmlFor="name">Nom complet</label>
          <input id="name" name="name" autoComplete="name" defaultValue={values.name} required aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "name-error" : undefined} />
          {errors.name && (
            <p id="name-error" className="field-error">
              {errors.name}
            </p>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="email">Adresse e-mail</label>
        <input id="email" name="email" type="email" autoComplete="email" defaultValue={values.email} required aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />
        {errors.email && (
          <p id="email-error" className="field-error">
            {errors.email}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="password">Mot de passe</label>
        <input id="password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} required aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "password-error" : register ? "password-hint" : undefined} />
        {register && !errors.password && (
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
          {pending ? "Un instant…" : register ? "Créer mon compte" : "Me connecter"}
        </button>
        {register ? (
          <Link href={`/compte/connexion${returnTo !== "/compte" ? `?retour=${encodeURIComponent(returnTo)}` : ""}`}>J&apos;ai déjà un compte</Link>
        ) : (
          <Link href={`/compte/inscription${returnTo !== "/compte" ? `?retour=${encodeURIComponent(returnTo)}` : ""}`}>Créer un compte</Link>
        )}
      </div>
    </form>
  );
}
