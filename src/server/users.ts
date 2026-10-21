import { and, asc, count, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { orders, sessions, users } from "@/db/schema";
import type { User, UserRole } from "@/db/schema";

import { escapeLike } from "./catalog";

export const USERS_PAGE_SIZE = 40;

export interface UserListFilter {
  q?: string;
  role?: UserRole;
  page?: number;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  suspendedAt: Date | null;
  createdAt: Date;
  orderCount: number;
}

export async function listUsers(db: Db, filter: UserListFilter = {}): Promise<{ rows: UserRow[]; total: number }> {
  const conditions = [];
  const needle = (filter.q ?? "").trim().toLowerCase();
  if (needle) {
    const pattern = `%${escapeLike(needle)}%`;
    conditions.push(or(ilike(users.email, pattern), ilike(users.name, pattern)));
  }
  if (filter.role) conditions.push(eq(users.role, filter.role));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const page = Math.max(1, filter.page ?? 1);

  const orderCount = sql<number>`(select count(*)::int from ${orders} where ${orders.userId} = ${users.id})`;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        suspendedAt: users.suspendedAt,
        createdAt: users.createdAt,
        orderCount,
      })
      .from(users)
      .where(where)
      // L'équipe d'abord, puis les clients du plus récent au plus ancien.
      .orderBy(sql`case ${users.role} when 'admin' then 0 when 'manager' then 1 else 2 end`, desc(users.createdAt), asc(users.email))
      .limit(USERS_PAGE_SIZE)
      .offset((page - 1) * USERS_PAGE_SIZE),
    db.select({ total: count() }).from(users).where(where),
  ]);
  return { rows, total };
}

export async function getUser(db: Db, id: string): Promise<User | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

export type UserChangeResult =
  | { ok: true; user: User; previous: User }
  | { ok: false; reason: "not_found" | "self" | "last_admin" | "unchanged" };

/**
 * Condition SQL « ce compte n'est pas le dernier administrateur actif » : elle
 * est évaluée dans la même instruction que la modification, si bien que deux
 * administrateurs qui se rétrogradent l'un l'autre au même instant ne peuvent
 * pas laisser la boutique sans administrateur.
 */
const notLastActiveAdmin = sql`not (${users.role} = 'admin' and ${users.suspendedAt} is null and (select count(*) from ${users} u where u.role = 'admin' and u.suspended_at is null) <= 1)`;

/** Change le rôle d'un compte. Un administrateur ne modifie jamais son propre rôle. */
export async function setUserRole(db: Db, actorId: string, targetId: string, role: UserRole): Promise<UserChangeResult> {
  if (actorId === targetId) return { ok: false, reason: "self" };
  const previous = await getUser(db, targetId);
  if (!previous) return { ok: false, reason: "not_found" };
  if (previous.role === role) return { ok: false, reason: "unchanged" };

  const demotesAdmin = previous.role === "admin";
  const [user] = await db
    .update(users)
    .set({ role })
    .where(and(eq(users.id, targetId), demotesAdmin ? notLastActiveAdmin : undefined))
    .returning();
  if (!user) return { ok: false, reason: "last_admin" };
  return { ok: true, user, previous };
}

/** Suspend ou réactive un compte. La suspension ferme aussi toutes ses sessions. */
export async function setUserSuspended(db: Db, actorId: string, targetId: string, suspended: boolean): Promise<UserChangeResult> {
  if (actorId === targetId) return { ok: false, reason: "self" };
  const previous = await getUser(db, targetId);
  if (!previous) return { ok: false, reason: "not_found" };
  if (Boolean(previous.suspendedAt) === suspended) return { ok: false, reason: "unchanged" };

  const [user] = await db
    .update(users)
    .set({ suspendedAt: suspended ? new Date() : null })
    .where(and(eq(users.id, targetId), suspended ? and(isNull(users.suspendedAt), notLastActiveAdmin) : ne(users.id, actorId)))
    .returning();
  if (!user) return { ok: false, reason: "last_admin" };
  if (suspended) await db.delete(sessions).where(eq(sessions.userId, targetId));
  return { ok: true, user, previous };
}
