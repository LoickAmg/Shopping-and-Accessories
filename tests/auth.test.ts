import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import { sessions } from "@/db/schema";
import {
  EmailTakenError,
  authenticate,
  createSession,
  deleteSession,
  getSessionUser,
  hashPassword,
  purgeExpiredSessions,
  registerUser,
  validatePassword,
  verifyPassword,
} from "@/server/auth";

import { createTestDb, resetDb } from "./helpers";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetDb(db);
});

describe("mots de passe", () => {
  it("vérifie un mot de passe sans jamais le stocker en clair", async () => {
    const hash = await hashPassword("un mot de passe solide");
    expect(hash).not.toContain("un mot de passe solide");
    expect(await verifyPassword("un mot de passe solide", hash)).toBe(true);
    expect(await verifyPassword("un autre mot de passe", hash)).toBe(false);
  });

  it("sale chaque empreinte", async () => {
    expect(await hashPassword("même mot de passe")).not.toBe(await hashPassword("même mot de passe"));
  });

  it("refuse une empreinte mal formée sans lever d'erreur", async () => {
    expect(await verifyPassword("x", "n'importe quoi")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$a$b")).toBe(false);
  });

  it("impose une longueur minimale et maximale", () => {
    expect(validatePassword("court")).toMatch(/au moins 10/);
    expect(validatePassword("x".repeat(200))).toMatch(/dépasser/);
    expect(validatePassword("un mot de passe correct")).toBeNull();
  });
});

describe("comptes", () => {
  it("normalise l'e-mail et refuse un doublon, quelle que soit la casse", async () => {
    const user = await registerUser(db, { email: "  Alice@Exemple.TEST ", password: "mot de passe long", name: "Alice" });
    expect(user.email).toBe("alice@exemple.test");
    expect(user.role).toBe("customer");
    await expect(
      registerUser(db, { email: "ALICE@exemple.test", password: "mot de passe long", name: "Autre" }),
    ).rejects.toBeInstanceOf(EmailTakenError);
  });

  it("désigne administrateur l'adresse configurée, et elle seule", async () => {
    const admin = await registerUser(
      db,
      { email: "Patron@exemple.test", password: "mot de passe long", name: "Patron" },
      { adminEmail: "patron@exemple.test" },
    );
    const customer = await registerUser(
      db,
      { email: "client@exemple.test", password: "mot de passe long", name: "Client" },
      { adminEmail: "patron@exemple.test" },
    );
    expect(admin.role).toBe("admin");
    expect(customer.role).toBe("customer");
  });

  it("ne promeut plus personne une fois qu'un administrateur existe", async () => {
    const first = await registerUser(
      db,
      { email: "premier@exemple.test", password: "mot de passe long", name: "Premier" },
      { adminEmail: "premier@exemple.test" },
    );
    expect(first.role).toBe("admin");

    const late = await registerUser(
      db,
      { email: "retardataire@exemple.test", password: "mot de passe long", name: "Retardataire" },
      { adminEmail: "retardataire@exemple.test" },
    );
    expect(late.role).toBe("customer");
  });

  it("ne crée qu'un administrateur même si deux inscriptions arrivent en même temps", async () => {
    const results = await Promise.all(
      ["a@exemple.test", "b@exemple.test"].map((email) =>
        registerUser(db, { email, password: "mot de passe long", name: "X" }, { adminEmail: email }),
      ),
    );
    expect(results.filter((user) => user.role === "admin").length).toBeLessThanOrEqual(1);
  });

  it("authentifie avec les bons identifiants seulement", async () => {
    await registerUser(db, { email: "bob@exemple.test", password: "mot de passe long", name: "Bob" });
    expect((await authenticate(db, "BOB@exemple.test", "mot de passe long"))?.name).toBe("Bob");
    expect(await authenticate(db, "bob@exemple.test", "mauvais mot de passe")).toBeNull();
    expect(await authenticate(db, "inconnu@exemple.test", "mot de passe long")).toBeNull();
  });
});

describe("sessions", () => {
  it("retrouve l'utilisateur d'un jeton valide et ne stocke que son empreinte", async () => {
    const user = await registerUser(db, { email: "carla@exemple.test", password: "mot de passe long", name: "Carla" });
    const { token } = await createSession(db, user.id);

    expect((await getSessionUser(db, token))?.id).toBe(user.id);
    const stored = await db.select().from(sessions);
    expect(stored.some((row) => row.id === token)).toBe(false);
  });

  it("refuse un jeton inconnu, absent ou expiré", async () => {
    const user = await registerUser(db, { email: "dan@exemple.test", password: "mot de passe long", name: "Dan" });
    const { token } = await createSession(db, user.id);

    expect(await getSessionUser(db, "jeton-inconnu")).toBeNull();
    expect(await getSessionUser(db, undefined)).toBeNull();

    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await getSessionUser(db, token)).toBeNull();
    await purgeExpiredSessions(db);
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it("supprime une session à la déconnexion", async () => {
    const user = await registerUser(db, { email: "eve@exemple.test", password: "mot de passe long", name: "Eve" });
    const { token } = await createSession(db, user.id);
    await deleteSession(db, token);
    expect(await getSessionUser(db, token)).toBeNull();
  });
});
