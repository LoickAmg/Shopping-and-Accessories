/**
 * Presets d'identité visuelle. Une boutique se change de secteur en changeant
 * `SHOP_THEME` : palette nommée, police d'affichage et rythme. Les couleurs
 * vivent uniquement dans `globals.css` (variables `--paper`, `--ink`…), ces
 * presets ne portent que les noms et les métadonnées.
 */
export const THEME_IDS = ["papier", "atelier", "marche"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface ThemePreset {
  id: ThemeId;
  label: string;
  /** Pour quel type de boutique ce preset a été pensé. */
  fits: string;
  themeColor: { light: string; dark: string };
}

export const THEMES: Record<ThemeId, ThemePreset> = {
  papier: {
    id: "papier",
    label: "Papier",
    fits: "Papeterie, livres, objets de maison, artisanat : ton éditorial, papier chaud et encre.",
    themeColor: { light: "#f4efe6", dark: "#1a1712" },
  },
  atelier: {
    id: "atelier",
    label: "Atelier",
    fits: "Outillage, mode, mobilier, design : fond sombre de métal et accent cuivre.",
    themeColor: { light: "#e9e6e1", dark: "#15171a" },
  },
  marche: {
    id: "marche",
    label: "Marché",
    fits: "Alimentation, plantes, bien-être, produits frais : verts profonds et terre cuite.",
    themeColor: { light: "#eef0e4", dark: "#141c16" },
  },
};

export function resolveTheme(id: string | undefined): ThemePreset {
  return THEMES[(id as ThemeId) in THEMES ? (id as ThemeId) : "papier"];
}
