import { sql } from "drizzle-orm";

import type { Db } from "@/db/client";
import { rateLimits } from "@/db/schema";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Compte une tentative pour `key` dans une fenêtre fixe et dit si elle est
 * autorisée. Une seule requête atomique : deux appels simultanés ne peuvent
 * pas se croiser, même sur deux instances différentes.
 */
export async function hitRateLimit(
  db: Db,
  key: string,
  options: { max: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const resetAt = sql`now() + make_interval(secs => ${options.windowSeconds})`;

  const rows = await db
    .insert(rateLimits)
    .values({ key, count: 1, resetAt: sql`${resetAt}` })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.resetAt} <= now() then 1 else ${rateLimits.count} + 1 end`,
        resetAt: sql`case when ${rateLimits.resetAt} <= now() then ${resetAt} else ${rateLimits.resetAt} end`,
      },
    })
    .returning({
      count: rateLimits.count,
      remaining: sql<number>`greatest(ceil(extract(epoch from (${rateLimits.resetAt} - now()))), 0)::int`,
    });

  const { count, remaining } = rows[0];
  return count > options.max
    ? { allowed: false, retryAfterSeconds: remaining }
    : { allowed: true, retryAfterSeconds: 0 };
}

/** Supprime les compteurs expirés (appelé de temps en temps, jamais sur le chemin critique). */
export async function purgeExpiredRateLimits(db: Db): Promise<void> {
  await db.delete(rateLimits).where(sql`${rateLimits.resetAt} <= now()`);
}
