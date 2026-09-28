"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getDb } from "@/db/client";
import { safeReturnPath } from "@/lib/redirect";
import {
  EmailTakenError,
  authenticate,
  createSession,
  deleteSession,
  registerUser,
  validatePassword,
} from "@/server/auth";
import { mergeGuestCart } from "@/server/cart";
import { CART_COOKIE, SESSION_COOKIE, cookieOptions, getCartId } from "@/server/context";
import { hitRateLimit } from "@/server/rate-limit";
import { clientFingerprint, fingerprintOf } from "@/server/request";

export interface AuthState {
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
}

const emailField = z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160);

async function openSession(userId: string): Promise<void> {
  const db = await getDb();
  const jar = await cookies();

  const merged = await mergeGuestCart(db, await getCartId(), userId);
  if (merged) jar.set(CART_COOKIE, merged, cookieOptions(new Date(Date.now() + 60 * 24 * 3600 * 1000)));

  const { token, expiresAt } = await createSession(db, userId);
  jar.set(SESSION_COOKIE, token, cookieOptions(expiresAt));
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

export async function registerAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { name: raw.name ?? "", email: raw.email ?? "", retour: raw.retour ?? "" };

  const parsed = z
    .object({ name: z.string().trim().min(2, "Le nom est obligatoire.").max(100), email: emailField, password: z.string() })
    .safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const passwordProblem = validatePassword(parsed.data.password);
  if (passwordProblem) return { errors: { password: passwordProblem }, values };

  const db = await getDb();
  const limit = await hitRateLimit(db, `register:${clientFingerprint(await headers())}`, { max: 8, windowSeconds: 3600 });
  if (!limit.allowed) return { message: "Trop d'inscriptions depuis cette adresse. Réessayez plus tard.", values };

  try {
    const user = await registerUser(db, parsed.data, { adminEmail: process.env.ADMIN_EMAIL });
    await openSession(user.id);
  } catch (error) {
    if (error instanceof EmailTakenError) return { errors: { email: error.message }, values };
    throw error;
  }
  redirect(safeReturnPath(raw.retour));
}

export async function loginAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { email: raw.email ?? "", retour: raw.retour ?? "" };

  const parsed = z.object({ email: emailField, password: z.string().min(1, "Le mot de passe est obligatoire.").max(200) }).safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const db = await getDb();
  const [byClient, byAccount] = await Promise.all([
    hitRateLimit(db, `login-ip:${clientFingerprint(await headers())}`, { max: 30, windowSeconds: 900 }),
    hitRateLimit(db, `login-account:${fingerprintOf(parsed.data.email)}`, { max: 8, windowSeconds: 900 }),
  ]);
  if (!byClient.allowed || !byAccount.allowed) {
    return { message: "Trop de tentatives de connexion. Réessayez dans quelques minutes.", values };
  }

  const user = await authenticate(db, parsed.data.email, parsed.data.password);
  if (!user) return { message: "E-mail ou mot de passe incorrect.", values };

  await openSession(user.id);
  redirect(safeReturnPath(raw.retour));
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  await deleteSession(await getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}
