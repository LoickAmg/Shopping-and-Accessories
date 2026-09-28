import { beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { hitRateLimit, purgeExpiredRateLimits } from "@/server/rate-limit";

import { createTestDb } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

describe("limitation de débit", () => {
  it("autorise jusqu'au maximum puis refuse avec un délai d'attente", async () => {
    const options = { max: 3, windowSeconds: 60 };
    const results = [];
    for (let attempt = 0; attempt < 5; attempt += 1) results.push(await hitRateLimit(db, "login:a", options));

    expect(results.map((result) => result.allowed)).toEqual([true, true, true, false, false]);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3].retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("compte chaque clé séparément", async () => {
    const options = { max: 1, windowSeconds: 60 };
    expect((await hitRateLimit(db, "login:b", options)).allowed).toBe(true);
    expect((await hitRateLimit(db, "login:b", options)).allowed).toBe(false);
    expect((await hitRateLimit(db, "login:c", options)).allowed).toBe(true);
  });

  it("repart de zéro quand la fenêtre est écoulée", async () => {
    await hitRateLimit(db, "login:d", { max: 1, windowSeconds: 60 });
    expect((await hitRateLimit(db, "login:d", { max: 1, windowSeconds: 60 })).allowed).toBe(false);

    await db.update(rateLimits).set({ resetAt: new Date(Date.now() - 1000) });
    expect((await hitRateLimit(db, "login:d", { max: 1, windowSeconds: 60 })).allowed).toBe(true);
  });

  it("supprime les compteurs expirés", async () => {
    await db.update(rateLimits).set({ resetAt: new Date(Date.now() - 1000) });
    await purgeExpiredRateLimits(db);
    expect(await db.select().from(rateLimits)).toHaveLength(0);
  });

  it("supporte des appels simultanés sans perdre de compte", async () => {
    const options = { max: 5, windowSeconds: 60 };
    const results = await Promise.all(Array.from({ length: 10 }, () => hitRateLimit(db, "login:e", options)));
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
  });
});
