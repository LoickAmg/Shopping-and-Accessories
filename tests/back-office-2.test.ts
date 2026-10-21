import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/db/client";
import { passwordResets, stockAlerts, users } from "@/db/schema";
import { createProduct, getProductForAdmin } from "@/server/admin";
import { registerUser } from "@/server/auth";
import type { Mailer } from "@/server/mailer";
import { orderShippedEmail } from "@/server/mailer";
import { checkResetToken, requestPasswordReset, resetPassword } from "@/server/password-reset";
import { buildProductWorkbook, importProductSheet } from "@/server/product-sheet";
import { columnName, readCsv, readXlsx, writeXlsx } from "@/server/spreadsheet";
import { adjustStock } from "@/server/stock";
import { notifyLowStock } from "@/server/stock-alerts";

import { createTestDb, resetDb, setStock, variantOf } from "./helpers";
import type { ProductInput } from "@/server/admin";

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetDb(db, { seeded: true });
});

function recordingMailer(): { mailer: Mailer; sent: { to: string; subject: string; text: string }[] } {
  const sent: { to: string; subject: string; text: string }[] = [];
  return { mailer: { async send(email) { sent.push(email); } }, sent };
}

const BAG = "cabas-double-soufflet-noir";

const DRESS: ProductInput = {
  name: "Robe portefeuille, lin bleu",
  summary: "Lin lavé.",
  description: "Coupe portefeuille.",
  categoryId: null,
  priceCents: 25000,
  compareAtCents: null,
  active: true,
  department: "femme",
  condition: "neuf",
  wearGrade: null,
  defects: "",
  material: "Lin",
  tone: "t2",
  imageUrl: "/assets/robe.jpeg",
  gallery: [],
  sku: "RB-01",
  variants: [
    { size: "S", color: "", sku: "RB-01-S", stock: 2 },
    { size: "M", color: "", sku: "RB-01-M", stock: 4 },
  ],
};

describe("classeur Excel (bas niveau)", () => {
  it("nomme les colonnes comme Excel", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(27)).toBe("AB");
  });

  it("écrit puis relit un classeur avec plusieurs feuilles, accents et nombres", () => {
    const bytes = writeXlsx([
      { name: "Produits", header: true, rows: [["Nom", "Prix"], ["Écharpe à franges", 45], ["Guillemets \"et\" esperluette &", 12.5]] },
      { name: "Notes", rows: [["Une autre feuille"]] },
    ]);
    const { sheet, rows } = readXlsx(bytes, "Produits");
    expect(sheet).toBe("Produits");
    expect(rows[0]).toEqual(["Nom", "Prix"]);
    expect(rows[1]).toEqual(["Écharpe à franges", "45"]);
    expect(rows[2]).toEqual(["Guillemets \"et\" esperluette &", "12.5"]);
  });

  it("lit un CSV avec point-virgule, guillemets et BOM (export Excel français)", () => {
    const csv = "﻿Nom;Prix\n\"Sac, cuir\";45\n\"Avec \"\"guillemets\"\"\";12\n";
    expect(readCsv(csv)).toEqual([["Nom", "Prix"], ["Sac, cuir", "45"], ['Avec "guillemets"', "12"]]);
  });
});

describe("export / import du catalogue", () => {
  it("exporte une ligne par déclinaison, avec le rayon et les tailles", async () => {
    await createProduct(db, DRESS);
    const bytes = await buildProductWorkbook(db);
    const { rows } = readXlsx(bytes, "Produits");
    const header = rows[0];
    const lines = rows.slice(1).filter((row) => row[header.indexOf("Nom")] === "Robe portefeuille, lin bleu");
    expect(lines).toHaveLength(2);
    expect(lines.map((row) => row[header.indexOf("Taille")])).toEqual(["S", "M"]);
    expect(lines[0][header.indexOf("Prix")]).toBe("250");
  });

  it("aperçu (dryRun) ne modifie rien", async () => {
    const created = await createProduct(db, DRESS);
    const bytes = await buildProductWorkbook(db);
    const summary = await importProductSheet(db, bytes, "", { dryRun: true });
    expect(summary.created).toBe(0);
    expect(summary.updated).toBeGreaterThan(0);
    const [admin] = [await getProductForAdmin(db, created.id)];
    expect(admin?.priceCents).toBe(25000);
  });

  it("réimporte sans modification : aucune ligne en erreur, quantités inchangées", async () => {
    const created = await createProduct(db, DRESS);
    const bytes = await buildProductWorkbook(db);
    const summary = await importProductSheet(db, bytes, "");
    expect(summary.errors).toEqual([]);
    expect(summary.updated).toBeGreaterThanOrEqual(1);
    const after = await getProductForAdmin(db, created.id);
    expect(after?.variants.map((v) => v.stock)).toEqual([2, 4]);
  });

  it("modifie prix et stock depuis le fichier, puis crée un nouveau produit sans identifiant", async () => {
    const created = await createProduct(db, DRESS);
    const { rows } = readXlsx(await buildProductWorkbook(db), "Produits");
    const header = rows[0];
    const priceIndex = header.indexOf("Prix");
    const stockIndex = header.indexOf("Stock");
    const idIndex = header.indexOf("Identifiant");
    const nameIndex = header.indexOf("Nom");

    const updatedRows = rows.map((row) => [...row]);
    for (let i = 1; i < updatedRows.length; i++) {
      if (updatedRows[i][idIndex] === String(created.id)) {
        updatedRows[i][priceIndex] = "300";
        updatedRows[i][stockIndex] = String(Number(updatedRows[i][stockIndex]) + 1);
      }
    }
    // Nouveau produit, sans identifiant, une seule ligne (sac sans taille).
    const newRow = Array(header.length).fill("");
    newRow[nameIndex] = "Pochette du soir";
    newRow[header.indexOf("Résumé")] = "Satin noir.";
    newRow[header.indexOf("Univers")] = "Femme";
    newRow[header.indexOf("État")] = "Neuf";
    newRow[priceIndex] = "89.90";
    newRow[stockIndex] = "3";
    updatedRows.push(newRow);

    const bytes = writeXlsx([{ name: "Produits", header: true, rows: updatedRows }]);
    const summary = await importProductSheet(db, bytes, "");
    expect(summary.errors).toEqual([]);
    expect(summary.created).toBe(1);
    expect(summary.updated).toBeGreaterThanOrEqual(1);

    const after = await getProductForAdmin(db, created.id);
    expect(after?.priceCents).toBe(30000);
    expect(after?.variants.find((v) => v.size === "S")?.stock).toBe(3);

    const { rows: finalRows } = readXlsx(await buildProductWorkbook(db), "Produits");
    expect(finalRows.some((row) => row[nameIndex] === "Pochette du soir")).toBe(true);
  });

  it("une ligne invalide est signalée sans bloquer les autres", async () => {
    const bytes = writeXlsx([
      {
        name: "Produits",
        header: true,
        rows: [
          ["Identifiant", "Nom", "Résumé", "Description", "Rayon", "Univers", "État", "État d'usure", "Défauts", "Matière", "Prix", "Prix barré", "Taille", "Couleur", "Stock", "Référence (taille)", "Référence (modèle)", "Photo principale", "Photos supplémentaires", "En vente"],
          ["", "Chapeau bob", "", "", "", "Mixte", "Neuf", "", "", "Coton", "pas un prix", "", "", "", "5", "", "", "", "", "Oui"],
          ["", "Bonnet", "", "", "", "Mixte", "Neuf", "", "", "Laine", "25", "", "", "", "10", "", "", "", "", "Oui"],
        ],
      },
    ]);
    const summary = await importProductSheet(db, bytes, "");
    expect(summary.created).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0].message).toMatch(/Prix/);
  });

  it("refuse un fichier qui n'est ni .xlsx ni .csv", async () => {
    await expect(importProductSheet(db, new TextEncoder().encode("\x00\x01binaire"), "")).rejects.toThrow();
  });

  it("identifiant inconnu : la ligne est signalée, rien n'est créé", async () => {
    const bytes = writeXlsx([
      {
        name: "Produits",
        header: true,
        rows: [
          ["Identifiant", "Nom", "Résumé", "Description", "Rayon", "Univers", "État", "État d'usure", "Défauts", "Matière", "Prix", "Prix barré", "Taille", "Couleur", "Stock", "Référence (taille)", "Référence (modèle)", "Photo principale", "Photos supplémentaires", "En vente"],
          ["999999", "Fantôme", "", "", "", "Mixte", "Neuf", "", "", "", "10", "", "", "", "0", "", "", "", "", "Oui"],
        ],
      },
    ]);
    const summary = await importProductSheet(db, bytes, "");
    expect(summary.created).toBe(0);
    expect(summary.updated).toBe(0);
    expect(summary.errors[0].message).toMatch(/inconnu/);
  });
});

describe("alerte de stock bas par e-mail", () => {
  it("alerte l'équipe (gestionnaires et administrateurs), pas les clients", async () => {
    const admin = await registerUser(db, { email: "admin@exemple.test", password: "mot de passe long", name: "Admin" });
    await db.update(users).set({ role: "admin" }).where(eq(users.id, admin.id));
    const manager = await registerUser(db, { email: "gerante@exemple.test", password: "mot de passe long", name: "Gérante" });
    await db.update(users).set({ role: "manager" }).where(eq(users.id, manager.id));
    await registerUser(db, { email: "client@exemple.test", password: "mot de passe long", name: "Client" });

    await setStock(db, BAG, 3);
    const { mailer, sent } = recordingMailer();
    await notifyLowStock(db, { force: true, mailer });

    expect(sent.map((email) => email.to).sort()).toEqual(["admin@exemple.test", "gerante@exemple.test"]);
    expect(sent[0].text).toMatch(/stock bas/i);
  });

  it("n'alerte qu'une fois tant que le stock reste bas, puis de nouveau après un passage au-dessus du seuil", async () => {
    await registerUser(db, { email: "admin@exemple.test", password: "mot de passe long", name: "Admin" }).then((u) => db.update(users).set({ role: "admin" }).where(eq(users.id, u.id)));

    await setStock(db, BAG, 3);
    const first = recordingMailer();
    await notifyLowStock(db, { force: true, mailer: first.mailer });
    expect(first.sent).toHaveLength(1);

    // Toujours bas : pas de rappel.
    await setStock(db, BAG, 2);
    const second = recordingMailer();
    await notifyLowStock(db, { force: true, mailer: second.mailer });
    expect(second.sent).toHaveLength(0);

    const variant = await variantOf(db, BAG);
    expect(await db.select().from(stockAlerts).where(eq(stockAlerts.variantId, variant.id))).toHaveLength(1);

    // Remonté au-dessus du seuil : la ligne d'alerte est effacée.
    await setStock(db, BAG, 50);
    const third = recordingMailer();
    await notifyLowStock(db, { force: true, mailer: third.mailer });
    expect(third.sent).toHaveLength(0);
    expect(await db.select().from(stockAlerts).where(eq(stockAlerts.variantId, variant.id))).toHaveLength(0);

    // Puis rebaisse : nouvelle alerte.
    await setStock(db, BAG, 1);
    const fourth = recordingMailer();
    await notifyLowStock(db, { force: true, mailer: fourth.mailer });
    expect(fourth.sent).toHaveLength(1);
  });

  it("une correction de stock manuelle déclenche la vérification", async () => {
    await registerUser(db, { email: "admin@exemple.test", password: "mot de passe long", name: "Admin" }).then((u) => db.update(users).set({ role: "admin" }).where(eq(users.id, u.id)));
    const variant = await variantOf(db, BAG);
    await setStock(db, BAG, 20);
    await adjustStock(db, [{ variantId: variant.id, from: 20, to: 3 }], null);
    const { mailer, sent } = recordingMailer();
    await notifyLowStock(db, { force: true, mailer });
    expect(sent).toHaveLength(1);
  });
});

describe("e-mail d'expédition", () => {
  const order = {
    id: "o1",
    number: 42,
    email: "c@exemple.test",
    customerName: "Camille",
    items: [],
  } as unknown as Parameters<typeof orderShippedEmail>[0];

  it("inclut le transporteur, le numéro et le lien quand ils sont renseignés", () => {
    const email = orderShippedEmail(order, { carrier: "Colissimo", number: "1Z999", url: "https://suivi.test/1Z999" });
    expect(email.to).toBe("c@exemple.test");
    expect(email.subject).toMatch(/expédiée/);
    expect(email.text).toMatch(/Colissimo/);
    expect(email.text).toMatch(/1Z999/);
    expect(email.text).toMatch(/https:\/\/suivi\.test\/1Z999/);
  });

  it("reste correct sans aucune information de suivi", () => {
    const email = orderShippedEmail(order, { carrier: "", number: "", url: "" });
    expect(email.text).not.toMatch(/Suivi du colis/);
    expect(email.text).toMatch(/expédiée/);
  });
});

describe("réinitialisation du mot de passe", () => {
  it("envoie un lien, le jeton pose le nouveau mot de passe une seule fois", async () => {
    const user = await registerUser(db, { email: "client@exemple.test", password: "ancien mot de passe", name: "Client" });
    const { mailer, sent } = recordingMailer();
    await requestPasswordReset(db, "Client@Exemple.TEST", mailer);
    expect(sent).toHaveLength(1);
    const token = /jeton=([\w-]+)/.exec(sent[0].text)?.[1];
    expect(token).toBeTruthy();

    expect(await checkResetToken(db, token!)).toEqual({ ok: true, userId: user.id });
    expect(await resetPassword(db, token!, "un nouveau mot de passe")).toBe(true);

    // Le jeton ne sert qu'une fois.
    expect(await checkResetToken(db, token!)).toEqual({ ok: false });
    expect(await resetPassword(db, token!, "encore un autre")).toBe(false);
  });

  it("ne révèle jamais si l'adresse existe", async () => {
    const { mailer, sent } = recordingMailer();
    await requestPasswordReset(db, "inconnu@exemple.test", mailer);
    expect(sent).toHaveLength(0);
  });

  it("refuse un jeton inventé ou expiré", async () => {
    await registerUser(db, { email: "client@exemple.test", password: "ancien mot de passe", name: "Client" });
    expect(await checkResetToken(db, "jeton-invente")).toEqual({ ok: false });

    const { mailer, sent } = recordingMailer();
    await requestPasswordReset(db, "client@exemple.test", mailer);
    const token = /jeton=([\w-]+)/.exec(sent[0].text)?.[1] ?? "";
    expect(token).toBeTruthy();
    await db.update(passwordResets).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await checkResetToken(db, token)).toEqual({ ok: false });
  });

  it("un compte suspendu ne reçoit pas de lien", async () => {
    const user = await registerUser(db, { email: "suspendu@exemple.test", password: "ancien mot de passe", name: "Suspendu" });
    await db.update(users).set({ suspendedAt: new Date() }).where(eq(users.id, user.id));
    const { mailer, sent } = recordingMailer();
    await requestPasswordReset(db, "suspendu@exemple.test", mailer);
    expect(sent).toHaveLength(0);
  });
});
