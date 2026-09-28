"use client";

import { useActionState } from "react";

import { placeOrderAction } from "@/app/actions/checkout";
import type { CheckoutState } from "@/app/actions/checkout";

interface Props {
  countries: { code: string; name: string }[];
  providers: { id: string; label: string }[];
  defaults: { email: string; name: string };
}

const INITIAL: CheckoutState = {};

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="field-error">
      {message}
    </p>
  ) : null;
}

export function CheckoutForm({ countries, providers, defaults }: Props) {
  const [state, action, pending] = useActionState(placeOrderAction, INITIAL);
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  const field = (name: string, fallback = "") => values[name] ?? fallback;
  const describedBy = (name: string) => (errors[name] ? `${name}-error` : undefined);

  return (
    <form action={action} className="stack" noValidate>
      {state.message && (
        <p className="notice notice-error" role="alert">
          {state.message}
        </p>
      )}
      {Object.keys(errors).length > 0 && (
        <p className="notice notice-error" role="alert">
          Certains champs sont à corriger.
        </p>
      )}

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>
          <h2>Vos coordonnées</h2>
        </legend>
        <div className="field-row">
          <div className="field">
            <label htmlFor="name">Nom complet</label>
            <input id="name" name="name" autoComplete="name" defaultValue={field("name", defaults.name)} required aria-invalid={Boolean(errors.name)} aria-describedby={describedBy("name")} />
            <FieldError id="name-error" message={errors.name} />
          </div>
          <div className="field">
            <label htmlFor="email">Adresse e-mail</label>
            <input id="email" name="email" type="email" autoComplete="email" defaultValue={field("email", defaults.email)} required aria-invalid={Boolean(errors.email)} aria-describedby={describedBy("email")} />
            <FieldError id="email-error" message={errors.email} />
          </div>
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>
          <h2>Adresse de livraison</h2>
        </legend>
        <div className="field">
          <label htmlFor="line1">Adresse</label>
          <input id="line1" name="line1" autoComplete="address-line1" defaultValue={field("line1")} required aria-invalid={Boolean(errors.line1)} aria-describedby={describedBy("line1")} />
          <FieldError id="line1-error" message={errors.line1} />
        </div>
        <div className="field">
          <label htmlFor="line2">Complément (facultatif)</label>
          <input id="line2" name="line2" autoComplete="address-line2" defaultValue={field("line2")} />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="postalCode">Code postal</label>
            <input id="postalCode" name="postalCode" autoComplete="postal-code" defaultValue={field("postalCode")} required aria-invalid={Boolean(errors.postalCode)} aria-describedby={describedBy("postalCode")} />
            <FieldError id="postalCode-error" message={errors.postalCode} />
          </div>
          <div className="field">
            <label htmlFor="city">Ville</label>
            <input id="city" name="city" autoComplete="address-level2" defaultValue={field("city")} required aria-invalid={Boolean(errors.city)} aria-describedby={describedBy("city")} />
            <FieldError id="city-error" message={errors.city} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="country">Pays</label>
            <select id="country" name="country" autoComplete="country" defaultValue={field("country", countries[0]?.code)} aria-invalid={Boolean(errors.country)}>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
            <FieldError id="country-error" message={errors.country} />
          </div>
          <div className="field">
            <label htmlFor="phone">Téléphone (facultatif)</label>
            <input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={field("phone")} />
            <p className="field-hint">Utile au livreur.</p>
          </div>
        </div>
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend>
          <h2>Paiement</h2>
        </legend>
        {providers.map((provider, index) => (
          <div className="field" key={provider.id}>
            <label style={{ fontWeight: 400 }}>
              <input type="radio" name="provider" value={provider.id} defaultChecked={field("provider", providers[0]?.id) === provider.id || (index === 0 && !values.provider)} /> {provider.label}
            </label>
          </div>
        ))}
        <FieldError id="provider-error" message={errors.provider} />
      </fieldset>

      <div className="field">
        <label style={{ fontWeight: 400 }}>
          <input type="checkbox" name="terms" aria-invalid={Boolean(errors.terms)} aria-describedby={describedBy("terms")} /> J&apos;ai lu et j&apos;accepte les{" "}
          <a href="/cgv" target="_blank" rel="noopener">
            conditions de vente
          </a>
          .
        </label>
        <FieldError id="terms-error" message={errors.terms} />
      </div>

      <button type="submit" className="button" disabled={pending}>
        {pending ? "Redirection vers le paiement…" : "Payer"}
      </button>
    </form>
  );
}
