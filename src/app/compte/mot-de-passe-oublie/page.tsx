import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";
import { getCurrentUser } from "@/server/context";

export const metadata: Metadata = { title: "Mot de passe oublié", robots: { index: false } };

export default async function ForgotPasswordPage() {
  if (await getCurrentUser()) redirect("/compte");

  return (
    <>
      <h1>Mot de passe oublié</h1>
      <p className="muted">Indiquez votre adresse e-mail : si un compte existe, un lien pour choisir un nouveau mot de passe vous sera envoyé.</p>
      <ForgotPasswordForm />
    </>
  );
}
