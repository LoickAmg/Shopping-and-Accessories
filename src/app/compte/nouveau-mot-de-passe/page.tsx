import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { getDb } from "@/db/client";
import { checkResetToken } from "@/server/password-reset";

export const metadata: Metadata = { title: "Nouveau mot de passe", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/compte/nouveau-mot-de-passe">) {
  const query = await searchParams;
  const token = typeof query.jeton === "string" ? query.jeton : "";
  const check = token ? await checkResetToken(await getDb(), token) : { ok: false as const };

  if (!check.ok) {
    return (
      <>
        <h1>Lien invalide</h1>
        <p className="muted">Ce lien n&apos;est plus valable : il a peut-être déjà servi, ou a expiré (il n&apos;est valable qu&apos;une heure).</p>
        <p>
          <Link href="/compte/mot-de-passe-oublie" className="button">
            Demander un nouveau lien
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Nouveau mot de passe</h1>
      <p className="muted">Choisissez un nouveau mot de passe pour votre compte.</p>
      <ResetPasswordForm token={token} />
    </>
  );
}
