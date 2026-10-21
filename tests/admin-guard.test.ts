import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Garde-fou statique du back-office. Le layout `/admin` ne suffit pas : Next.js
 * rend les pages en parallèle du layout, si bien qu'une page qui ne vérifie pas
 * elle-même le rôle envoie ses données (commandes, clients) dans la réponse,
 * même quand le layout redirige. Chaque page et chaque action doit donc appeler
 * `requireStaff()` ou `requireAdmin()` avant toute lecture ou écriture, et les
 * pages réservées à l'administrateur (argent, comptes, journal) `requireAdmin()`.
 */

const GUARD = /^(?:const \w+ = )?await require(Staff|Admin)\((?:"\w+")?\);/;
const ADMIN_ONLY_PAGES = ["devises", "utilisateurs", "journal"];
const ADMIN_ONLY_ACTIONS = ["setCurrencyRateAction", "setUserRoleAction", "setUserSuspendedAction"];

const root = path.resolve(import.meta.dirname, "..");

function pagesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return pagesUnder(full);
    return entry === "page.tsx" ? [full] : [];
  });
}

/** Corps de la fonction exportée par défaut, jusqu'au premier `await` qui touche aux données. */
function firstStatements(source: string, signature: RegExp): string {
  const match = signature.exec(source);
  if (!match) return "";
  return source.slice(match.index + match[0].length, match.index + match[0].length + 200);
}

describe("protection du back-office", () => {
  const adminPages = pagesUnder(path.join(root, "src/app/admin"));

  it("couvre toutes les pages d'administration", () => {
    expect(adminPages.length).toBeGreaterThanOrEqual(11);
  });

  it.each(adminPages.map((file) => [path.relative(root, file), file]))("%s vérifie le rôle avant tout", (_name, file) => {
    const source = readFileSync(file, "utf8");
    const body = firstStatements(source, /export default async function \w+\([^)]*\)[^{]*\{/);
    const guard = GUARD.exec(body.trim());
    expect(guard, "garde manquante").not.toBeNull();
    if (ADMIN_ONLY_PAGES.some((name) => file.includes(path.join("admin", name)))) expect(guard?.[1]).toBe("Admin");
  });

  it("le layout réserve le back-office à l'équipe", () => {
    const source = readFileSync(path.join(root, "src/app/admin/layout.tsx"), "utf8");
    expect(firstStatements(source, /export default async function \w+\([^)]*\)[^{]*\{/).trim()).toMatch(GUARD);
  });

  it("chaque action d'administration vérifie le rôle en premier", () => {
    const source = readFileSync(path.join(root, "src/app/actions/admin.ts"), "utf8");
    const actions = [...source.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{/g)];
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      const body = source.slice(action.index + action[0].length, action.index + action[0].length + 80);
      const guard = GUARD.exec(body.trim());
      expect(guard, action[1]).not.toBeNull();
      if (ADMIN_ONLY_ACTIONS.includes(action[1])) expect(guard?.[1], action[1]).toBe("Admin");
    }
  });
});
