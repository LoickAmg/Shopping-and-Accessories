import { describe, expect, it, vi } from "vitest";

import { getSeller } from "@/config/legal";
import { toMinorUnits } from "@/config/store";
import { formatMoney, minorToInput, parseMoneyInput } from "@/lib/money";
import { buildSearchText, normalizeForSearch, slugify } from "@/lib/slug";
import { createLogMailer, createResendMailer, orderConfirmationEmail, sendOrderConfirmation } from "@/server/mailer";
import type { OrderWithItems } from "@/server/orders";
import { clientFingerprint, fingerprintOf } from "@/server/request";

const XOF = { code: "XOF", exponent: 0 };
const EUR = { code: "EUR", exponent: 2 };

describe("monnaie", () => {
  it("formate en franc CFA sans décimale et en euro avec deux décimales", () => {
    expect(formatMoney(12500, XOF).replace(/\s/g, " ")).toMatch(/12 500\s?F\s?CFA/);
    expect(formatMoney(1250, EUR).replace(/\s/g, " ")).toMatch(/12,50\s?€/);
  });

  it("convertit les unités principales en unités mineures sans erreur d'arrondi", () => {
    expect(toMinorUnits(12.5, 2)).toBe(1250);
    expect(toMinorUnits(0.1 + 0.2, 2)).toBe(30);
    expect(toMinorUnits(9500, 0)).toBe(9500);
  });

  it("lit une saisie humaine, y compris les espaces insécables et la virgule", () => {
    expect(parseMoneyInput("12,50", 2)).toBe(1250);
    expect(parseMoneyInput("12.5", 2)).toBe(1250);
    expect(parseMoneyInput("12 500", 0)).toBe(12500);
    expect(parseMoneyInput("12 500", 0)).toBe(12500);
    expect(parseMoneyInput("12 500", 0)).toBe(12500);
  });

  it("refuse une saisie invalide ou trop précise", () => {
    for (const bad of ["", "abc", "-5", "12,345", "1e3", "12,5,1"]) expect(parseMoneyInput(bad, 2), bad).toBeNull();
    expect(parseMoneyInput("12,5", 0)).toBeNull();
  });

  it("prépare un champ de formulaire", () => {
    expect(minorToInput(1250, 2)).toBe("12.50");
    expect(minorToInput(12500, 0)).toBe("12500");
  });
});

describe("identifiants d'URL et recherche", () => {
  it("retire accents, ligatures et ponctuation", () => {
    expect(slugify("Café moulu, 250 g")).toBe("cafe-moulu-250-g");
    expect(slugify("Cœur d'artichaut")).toBe("coeur-d-artichaut");
    expect(slugify("  --Été--  ")).toBe("ete");
    expect(slugify("!!!")).toBe("");
  });

  it("normalise pour la recherche", () => {
    expect(normalizeForSearch("Théière ÉMAILLÉE")).toBe("theiere emaillee");
    expect(buildSearchText("Vase", "grès", "Maison")).toBe("vase gres maison");
  });
});

describe("identité du vendeur", () => {
  it("lit l'environnement et applique des valeurs par défaut prudentes", () => {
    const seller = getSeller({ SHOP_LEGAL_NAME: "Awa", SHOP_CONTACT_EMAIL: "awa@boutique.test", SHOP_RETURN_DAYS: "30" });
    expect(seller.name).toBe("Awa");
    expect(seller.returnDays).toBe(30);
    expect(seller.status).toMatch(/non professionnel/);
  });

  it("signale les champs manquants au lieu d'inventer une identité", () => {
    const seller = getSeller({});
    expect(seller.name).toMatch(/à renseigner/);
    expect(seller.email).toMatch(/à renseigner/);
    expect(seller.returnDays).toBe(14);
  });

  it("ignore un nombre de jours de rétractation invalide", () => {
    expect(getSeller({ SHOP_RETURN_DAYS: "abc" }).returnDays).toBe(14);
    expect(getSeller({ SHOP_RETURN_DAYS: "-3" }).returnDays).toBe(14);
  });
});

describe("empreinte de visiteur", () => {
  it("ne dépend que de la première adresse transmise et jamais de l'adresse en clair", () => {
    const a = clientFingerprint(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }), "secret");
    const b = clientFingerprint(new Headers({ "x-forwarded-for": "203.0.113.5" }), "secret");
    const c = clientFingerprint(new Headers({ "x-forwarded-for": "203.0.113.6" }), "secret");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("203");
  });

  it("change avec le secret et ne distingue pas la casse d'une adresse e-mail", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5" });
    expect(clientFingerprint(headers, "un")).not.toBe(clientFingerprint(headers, "deux"));
    expect(fingerprintOf("Awa@Boutique.test", "s")).toBe(fingerprintOf("awa@boutique.test", "s"));
  });
});

const ORDER = {
  id: "11111111-1111-4111-8111-111111111111",
  number: 7,
  email: "client@exemple.test",
  customerName: "Awa Test",
  accessToken: "jeton-secret",
  currency: "XOF",
  shippingCents: 2000,
  totalCents: 7000,
  shippingAddress: { line1: "12 rue du Marché", postalCode: "01 BP 234", city: "Cotonou", country: "BJ" },
  items: [{ id: 1, orderId: "x", productId: 1, name: "Savon de Marseille", unitPriceCents: 5000, quantity: 1 }],
} as unknown as OrderWithItems;

describe("e-mails", () => {
  it("rédige une confirmation complète avec lien de suivi", () => {
    const email = orderConfirmationEmail(ORDER);
    expect(email.to).toBe("client@exemple.test");
    expect(email.subject).toContain("n° 7");
    expect(email.text).toContain("Savon de Marseille");
    expect(email.text).toContain("12 rue du Marché");
    expect(email.text).toContain(`/commande/${ORDER.id}?token=jeton-secret`);
  });

  it("appelle Resend avec la clé et le bon corps", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const mailer = createResendMailer({
      apiKey: "re_test",
      from: "Étal <bonjour@boutique.test>",
      fetchImpl: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    });
    await mailer.send({ to: "a@b.test", subject: "Sujet", text: "Corps" });

    expect(calls[0].url).toBe("https://api.resend.com/emails");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer re_test");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ from: "Étal <bonjour@boutique.test>", to: ["a@b.test"], subject: "Sujet", text: "Corps" });
  });

  it("n'envoie rien sans clé et ne fait jamais échouer un paiement sur une panne d'e-mail", async () => {
    const lines: string[] = [];
    await createLogMailer((line) => lines.push(line)).send({ to: "a@b.test", subject: "S", text: "T" });
    expect(lines[0]).toMatch(/non envoyé/);

    const failing = createResendMailer({ apiKey: "k", from: "f", fetchImpl: (async () => new Response("", { status: 500 })) as unknown as typeof fetch });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await sendOrderConfirmation(ORDER, failing)).toBe(false);
    spy.mockRestore();
  });
});
