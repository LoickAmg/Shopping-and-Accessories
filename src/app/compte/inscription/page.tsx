import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/AuthForm";
import { safeReturnPath } from "@/lib/redirect";
import { getCurrentUser } from "@/server/context";

export const metadata: Metadata = { title: "Créer un compte", robots: { index: false } };

export default async function RegisterPage({ searchParams }: PageProps<"/compte/inscription">) {
  const query = await searchParams;
  const returnTo = safeReturnPath(Array.isArray(query.retour) ? query.retour[0] : query.retour);
  if (await getCurrentUser()) redirect(returnTo);

  return (
    <>
      <h1>Créer un compte</h1>
      <p className="muted">Un compte sert à suivre vos commandes. Il n&apos;est pas obligatoire pour acheter.</p>
      <AuthForm mode="register" returnTo={returnTo} />
    </>
  );
}
