import { describe, expect, it } from "vitest";

import { safeReturnPath } from "@/lib/redirect";

describe("safeReturnPath", () => {
  it("accepte un chemin interne", () => {
    expect(safeReturnPath("/commande")).toBe("/commande");
    expect(safeReturnPath("/boutique?categorie=maison")).toBe("/boutique?categorie=maison");
  });

  it("refuse toute destination externe ou ambiguë", () => {
    for (const evil of ["https://ailleurs.test", "//ailleurs.test", String.raw`/\ailleurs.test`, "javascript:alert(1)", "ailleurs", "/a\nb", ""]) {
      expect(safeReturnPath(evil), evil).toBe("/compte");
    }
    expect(safeReturnPath(undefined)).toBe("/compte");
    expect(safeReturnPath(42)).toBe("/compte");
    expect(safeReturnPath("//x", "/")).toBe("/");
  });
});
