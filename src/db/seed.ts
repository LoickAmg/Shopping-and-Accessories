import { count } from "drizzle-orm";

import { store, toMinorUnits } from "@/config/store";
import { slugify } from "@/lib/slug";
import { searchTextOf } from "@/server/admin";

import type { Db } from "./client";
import { categories, productVariants, products } from "./schema";
import type { CategoryFamily } from "./schema";

interface SeedProduct {
  name: string;
  summary: string;
  description: string;
  /** Prix en unité principale de la devise de la boutique (en XOF : francs ; en EUR : euros). */
  price: { xof: number; eur: number };
  stock: number;
  tone: string;
  /** Photo servie depuis `public/`. */
  image: string;
}

interface SeedCategory {
  name: string;
  description: string;
  family: CategoryFamily;
  products: SeedProduct[];
}

/**
 * Catalogue de démonstration de Shopping & Accessories : les sacs photographiés
 * dans `public/assets`. Il montre chaque partie de la boutique (rayons, rupture,
 * stock bas, prix barrés) et se remplace depuis l'administration.
 */
const CATALOG: SeedCategory[] = [
  {
    name: "Sacs à main",
    description: "Portés à la main ou au creux du bras : des lignes nettes pour le bureau comme pour le soir.",
    family: "sacs",
    products: [
      {
        name: "Sac Trapèze Croco, bleu nuit",
        summary: "Cuir embossé façon croco, rabat en daim, chaîne dorée amovible.",
        description:
          "Une silhouette trapèze tenue, en cuir embossé bleu nuit. Le rabat en daim se ferme d'un tourniquet doré ; l'anse gainée se porte à la main, la chaîne et sa bandoulière bleu ciel permettent de le passer à l'épaule.",
        price: { xof: 48000, eur: 74 },
        stock: 6,
        tone: "t4",
        image: "/assets/product-2.jpeg",
      },
      {
        name: "Sac Cartable Clou, noir",
        summary: "Cuir grainé, panneaux surpiqués, fermoir à clous encadré de doré.",
        description:
          "Une architecture de panneaux surpiqués, deux galons tissés noir et blanc et un fermoir à clous encadré de doré. Grand compartiment, anse double assez haute pour le porter au bras.",
        price: { xof: 39000, eur: 59 },
        stock: 3,
        tone: "t1",
        image: "/assets/product-5.jpeg",
      },
      {
        name: "Sac Bowling Zip, noir",
        summary: "Cuir grainé souple, fermeture zippée dorée, anses arrondies.",
        description:
          "Le classique bowling, en cuir grainé noir. Fermeture éclair dorée sur toute la largeur, anses roulottées et base élargie qui tient debout : il avale ordinateur fin, agenda et trousse.",
        price: { xof: 42000, eur: 64 },
        stock: 11,
        tone: "t2",
        image: "/assets/product-7.jpeg",
      },
    ],
  },
  {
    name: "Cabas",
    description: "Des volumes généreux qui gardent leur tenue, pour tout emporter sans rien sacrifier à l'allure.",
    family: "sacs",
    products: [
      {
        name: "Cabas Médaillon, cuir noir",
        summary: "Cuir souple pleine fleur, médaillon doré, anses gainées.",
        description:
          "Un cabas au cuir souple qui se creuse joliment à l'usage. Le médaillon doré signe la façade ; les anses gainées sont cerclées aux attaches pour durer.",
        price: { xof: 55000, eur: 84 },
        stock: 4,
        tone: "t5",
        image: "/assets/product-1.jpeg",
      },
      {
        name: "Tote Clochette, noir",
        summary: "Cuir texturé structuré, clochette porte-clé, bandoulière incluse.",
        description:
          "Une ligne architecturée aux flancs évasés, doublée d'un rouge profond. La clochette et sa sangle à boucle habillent l'anse ; la bandoulière amovible le transforme en sac porté croisé.",
        price: { xof: 36000, eur: 55 },
        stock: 14,
        tone: "t3",
        image: "/assets/product-4.jpeg",
      },
      {
        name: "Cabas Double Soufflet, noir",
        summary: "Cuir grainé, deux soufflets, poche centrale zippée.",
        description:
          "Deux compartiments ouverts de part et d'autre d'une poche centrale zippée : chaque chose trouve sa place. Anses longues pour l'épaule, finitions dorées discrètes.",
        price: { xof: 25000, eur: 38 },
        stock: 40,
        tone: "t6",
        image: "/assets/product-8.jpeg",
      },
    ],
  },
  {
    name: "Sacs d'épaule",
    description: "Chaînes dorées et cuirs embossés : les sacs qu'on garde sur soi du matin au soir.",
    family: "sacs",
    products: [
      {
        name: "Baguette Chaîne Croco, noir",
        summary: "Cuir embossé croco brillant, anse cuir et chaîne dorée.",
        description:
          "Une baguette allongée au cuir embossé brillant. L'anse en cuir nouée se prolonge d'une double chaîne dorée : elle se glisse sous le bras et se porte aussi bien de jour que de soir.",
        price: { xof: 45000, eur: 69 },
        stock: 9,
        tone: "t2",
        image: "/assets/product-6.jpeg",
      },
      {
        name: "Seau Croco à fermoir doré",
        summary: "Forme seau, cuir embossé mat, fermoir doré et anse réglable.",
        description:
          "Un seau en cuir embossé mat, poche plaquée sur la façade et fermoir doré. L'anse se règle d'une boucle pour ajuster la hauteur de portée.",
        price: { xof: 33000, eur: 50 },
        stock: 0,
        tone: "t1",
        image: "/assets/product-3.jpeg",
      },
    ],
  },
];

/**
 * Rayons prêts à accueillir les vêtements et les bijoux. Ils restent vides tant
 * qu'aucune pièce n'y est ajoutée depuis l'administration (aucun produit n'est
 * inventé sans vraie photo) ; l'accueil n'affiche que les rayons garnis.
 */
const EMPTY_SHELVES: { name: string; description: string; family: CategoryFamily }[] = [
  { name: "Hauts & chemises", description: "T-shirts, chemises, blouses et pulls.", family: "vetements" },
  { name: "Robes & jupes", description: "Robes, jupes et ensembles.", family: "vetements" },
  { name: "Pantalons & shorts", description: "Pantalons, jeans et shorts.", family: "vetements" },
  { name: "Vestes & manteaux", description: "Vestes, blousons et manteaux.", family: "vetements" },
  { name: "Colliers", description: "Colliers et pendentifs.", family: "bijoux" },
  { name: "Bagues", description: "Bagues, à chaque taille de doigt.", family: "bijoux" },
  { name: "Bracelets", description: "Bracelets et joncs.", family: "bijoux" },
];

/** Prix « barré » de démonstration sur quelques articles, pour montrer l'affichage d'une remise. */
const COMPARE_AT: Record<string, number> = {
  "Sac Trapèze Croco, bleu nuit": 1.2,
  "Baguette Chaîne Croco, noir": 1.15,
};

export async function seedCatalog(db: Db): Promise<void> {
  const exponent = store.currency.exponent;
  const xof = exponent === 0;

  for (const [position, category] of CATALOG.entries()) {
    const [inserted] = await db
      .insert(categories)
      .values({ slug: slugify(category.name), name: category.name, description: category.description, family: category.family, position })
      .onConflictDoNothing()
      .returning();
    if (!inserted) continue;

    for (const product of category.products) {
      const major = xof ? product.price.xof : product.price.eur;
      const priceCents = toMinorUnits(major, exponent);
      const factor = COMPARE_AT[product.name];
      const fields = { name: product.name, summary: product.summary, description: product.description, material: "Cuir", department: "femme" as const, condition: "neuf" as const };
      const [row] = await db
        .insert(products)
        .values({
          ...fields,
          slug: slugify(product.name),
          searchText: searchTextOf(fields, category.name),
          categoryId: inserted.id,
          priceCents,
          compareAtCents: factor ? Math.round((priceCents * factor) / 10 ** exponent) * 10 ** exponent : null,
          tone: product.tone,
          imageUrl: product.image,
        })
        .onConflictDoNothing()
        .returning({ id: products.id });
      // Un sac n'a pas de taille : une seule déclinaison, qui porte le stock.
      if (row) await db.insert(productVariants).values({ productId: row.id, stock: product.stock });
    }
  }

  for (const [offset, shelf] of EMPTY_SHELVES.entries()) {
    await db
      .insert(categories)
      .values({ ...shelf, slug: slugify(shelf.name), position: CATALOG.length + offset })
      .onConflictDoNothing();
  }
}

export async function seedIfEmpty(db: Db): Promise<void> {
  const [row] = await db.select({ total: count() }).from(products);
  if ((row?.total ?? 0) === 0) await seedCatalog(db);
}
