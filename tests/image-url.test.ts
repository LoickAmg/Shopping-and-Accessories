import { describe, expect, it } from "vitest";

import { isAllowedImageUrl } from "@/lib/image-url";

describe("adresse d'image du back-office", () => {
  it("accepte les photos du site, comme celles du catalogue de démonstration", () => {
    for (const ok of ["/assets/product-1.jpeg", "/assets/sacs/cabas%20noir.webp"]) {
      expect(isAllowedImageUrl(ok), ok).toBe(true);
    }
  });

  it("accepte une image distante en HTTPS", () => {
    expect(isAllowedImageUrl("https://images.exemple.test/sac.jpg")).toBe(true);
  });

  it("refuse les adresses dangereuses ou ambiguës", () => {
    for (const bad of [
      "http://exemple.test/sac.jpg",
      "//exemple.test/sac.jpg",
      "/\\exemple.test",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      "assets/sac.jpg",
      "https://",
      "/assets/sac .jpg",
      "/assets/sac\n.jpg",
    ]) {
      expect(isAllowedImageUrl(bad), bad).toBe(false);
    }
  });
});
