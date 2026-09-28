import Link from "next/link";

export default function NotFound() {
  return (
    <section className="not-found">
      <p className="code" aria-hidden="true">
        404
      </p>
      <h1>Cette page n&apos;existe pas</h1>
      <p className="muted">Le lien est peut-être ancien, ou le produit a été retiré du catalogue.</p>
      <div className="actions">
        <Link href="/boutique" className="button">
          Voir le catalogue
        </Link>
        <Link href="/">Accueil</Link>
      </div>
    </section>
  );
}
