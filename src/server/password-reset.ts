import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { store } from "@/config/store";
import type { Db } from "@/db/client";
import { passwordResets, users } from "@/db/schema";
import { siteUrl } from "@/payments/registry";

import { hashPassword, normalizeEmail } from "./auth";
import type { Mailer } from "./mailer";
import { getMailer } from "./mailer";

const RESET_MINUTES = 60;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Demande de réinitialisation : crée un jeton à usage unique et envoie le lien
 * par e-mail. Ne révèle jamais si l'adresse existe — la réponse est la même
 * dans les deux cas — pour ne pas servir à deviner les comptes inscrits.
 */
export async function requestPasswordReset(db: Db, emailInput: string, mailer: Mailer = getMailer()): Promise<void> {
  const email = normalizeEmail(emailInput);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.suspendedAt) return;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + RESET_MINUTES * 60 * 1000);
  await db.insert(passwordResets).values({ id: hashToken(token), userId: user.id, expiresAt });

  const link = `${siteUrl()}/compte/nouveau-mot-de-passe?jeton=${token}`;
  try {
    await mailer.send({
      to: user.email,
      subject: `Réinitialiser votre mot de passe — ${store.name}`,
      text: [
        `Bonjour ${user.name || ""},`.trim(),
        "",
        "Une réinitialisation de votre mot de passe a été demandée. Si ce n'est pas vous, ignorez cet e-mail : rien ne change.",
        "",
        `Choisir un nouveau mot de passe (valable ${RESET_MINUTES} minutes) : ${link}`,
        "",
        store.name,
      ].join("\n"),
    });
  } catch (error) {
    console.error("E-mail de réinitialisation non envoyé :", error);
  }
}

export type ResetTokenCheck = { ok: true; userId: string } | { ok: false };

/** Vérifie un jeton de réinitialisation sans le consommer (pour afficher le formulaire). */
export async function checkResetToken(db: Db, token: string): Promise<ResetTokenCheck> {
  if (!token || token.length > 200) return { ok: false };
  const [row] = await db.select().from(passwordResets).where(and(eq(passwordResets.id, hashToken(token)), isNull(passwordResets.usedAt))).limit(1);
  if (!row || row.expiresAt.getTime() <= Date.now()) return { ok: false };
  return { ok: true, userId: row.userId };
}

/** Pose le nouveau mot de passe et consomme le jeton (il ne sert plus qu'une fois). */
export async function resetPassword(db: Db, token: string, newPassword: string): Promise<boolean> {
  const check = await checkResetToken(db, token);
  if (!check.ok) return false;

  const passwordHash = await hashPassword(newPassword);
  const [used] = await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.id, hashToken(token)), isNull(passwordResets.usedAt)))
    .returning({ id: passwordResets.id });
  if (!used) return false; // Consommé entre-temps (deux clics sur le même lien) : on ne pose pas deux fois le mot de passe.

  await db.update(users).set({ passwordHash }).where(eq(users.id, check.userId));
  return true;
}
