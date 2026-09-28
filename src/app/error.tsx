"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="not-found" role="alert">
      <p className="code" aria-hidden="true">
        !
      </p>
      <h1>Un incident est survenu</h1>
      <p className="muted">La page n&apos;a pas pu s&apos;afficher. Vos données ne sont pas perdues : vous pouvez réessayer ou revenir au catalogue.</p>
      <div className="actions">
        <button type="button" className="button" onClick={reset}>
          Réessayer
        </button>
        <Link href="/boutique">Voir le catalogue</Link>
      </div>
    </section>
  );
}
