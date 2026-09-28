import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

import { eq, lt, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { sessions, users } from "@/db/schema";
import type { User } from "@/db/schema";

const SESSION_DAYS = 30;
interface ScryptParams {
  N: number;
  r: number;
  p: number;
  keyLength: number;
}

const SCRYPT: ScryptParams = { N: 16384, r: 8, p: 1, keyLength: 64 };

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, params.keyLength, { N: params.N, r: params.r, p: params.p, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Format : scrypt$N$r$p$sel$empreinte (base64). Les paramètres sont stockés pour pouvoir les durcir plus tard. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await derive(
    password,
    Buffer.from(saltB64, "base64"),
    { N: Number(n), r: Number(r), p: Number(p), keyLength: expected.length },
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Empreinte fictive : sert à dépenser le même temps de calcul quand le compte n'existe pas. */
let dummyHash: Promise<string> | undefined;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Le mot de passe ne peut pas dépasser ${PASSWORD_MAX_LENGTH} caractères.`;
  return null;
}

export class EmailTakenError extends Error {
  constructor() {
    super("Un compte existe déjà avec cette adresse e-mail.");
    this.name = "EmailTakenError";
  }
}

/**
 * Crée un compte. L'adresse `adminEmail` donne le rôle d'administrateur **une
 * seule fois** : uniquement tant qu'aucun administrateur n'existe, dans la même
 * instruction SQL que l'insertion (deux inscriptions simultanées ne peuvent pas
 * produire deux administrateurs). Une adresse e-mail n'étant pas vérifiée, cette
 * règle évite qu'un tiers qui connaît l'adresse configurée obtienne le rôle
 * après que le premier administrateur a été créé.
 */
export async function registerUser(
  db: Db,
  input: { email: string; password: string; name: string },
  options: { adminEmail?: string } = {},
): Promise<User> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const wantsAdmin = Boolean(options.adminEmail) && normalizeEmail(options.adminEmail ?? "") === email;

  try {
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        name: input.name.trim(),
        role: wantsAdmin
          ? sql`case when exists (select 1 from users where role = 'admin') then 'customer' else 'admin' end`
          : "customer",
      })
      .returning();
    return user;
  } catch (error) {
    if (isUniqueViolation(error)) throw new EmailTakenError();
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function authenticate(db: Db, emailInput: string, password: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(emailInput))).limit(1);

  if (!user) {
    dummyHash ??= hashPassword("mot-de-passe-fictif-pour-temps-constant");
    await verifyPassword(password, await dummyHash);
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(db: Db, userId: string): Promise<CreatedSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function getSessionUser(db: Db, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, hashToken(token)))
    .limit(1);
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return row.user;
}

export async function deleteSession(db: Db, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function purgeExpiredSessions(db: Db): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
