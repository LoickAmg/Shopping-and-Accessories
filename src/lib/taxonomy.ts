import type { CategoryFamily, Condition, Department, ProductVariant, WearGrade } from "@/db/schema";

/** Libellés affichés des univers, états, niveaux d'usure et familles de rayons. */

export const DEPARTMENT_LABELS: Record<Department, string> = {
  femme: "Femme",
  homme: "Homme",
  enfant: "Enfant",
  mixte: "Mixte",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  neuf: "Neuf",
  seconde_main: "Friperie",
  fin_de_serie: "Fin de série",
};

export const WEAR_GRADE_LABELS: Record<WearGrade, string> = {
  comme_neuf: "Comme neuf",
  tres_bon: "Très bon état",
  bon: "Bon état",
};

export const FAMILY_LABELS: Record<CategoryFamily, string> = {
  vetements: "Vêtements",
  sacs: "Sacs",
  bijoux: "Bijoux",
  accessoires: "Accessoires",
};

/** « Taille M · Noir » ; vide pour un article sans taille ni couleur. */
export function variantLabel(variant: Pick<ProductVariant, "size" | "color">): string {
  return [variant.size && `Taille ${variant.size}`, variant.color].filter(Boolean).join(" · ");
}

/** Vrai si le produit se décline réellement (au moins une taille ou une couleur renseignée). */
export function hasRealVariants(variants: Pick<ProductVariant, "size" | "color">[]): boolean {
  return variants.some((variant) => variant.size !== "" || variant.color !== "");
}
