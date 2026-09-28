/** Transforme un libellé en identifiant d'URL : « Café moulu » → « cafe-moulu ». */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Minuscules, sans accents ni ligatures : forme commune de comparaison pour la recherche. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

export function buildSearchText(...parts: string[]): string {
  return normalizeForSearch(parts.join(" "));
}
