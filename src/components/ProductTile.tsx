import Link from "next/link";

import type { Currency } from "@/db/schema";
import { initialOf, moneyIn } from "@/lib/format";
import { CONDITION_LABELS } from "@/lib/taxonomy";
import type { ProductListItem } from "@/server/catalog";

type DisplayCurrency = Pick<Currency, "code" | "exponent" | "rateMicros">;

/** Photos de la galerie de l'accueil (dôme, savoir-faire) : les sacs du catalogue d'origine. */
export const catalogImages = Array.from({ length: 8 }, (_, index) => `/assets/product-${index + 1}.jpeg`);

/**
 * Vignette d'un produit : sa photo, ou à défaut son initiale sur la teinte
 * choisie. Jamais la photo d'un autre article : une robe sans photo ne doit
 * pas s'afficher avec un sac.
 */
export function TileArt({ name, tone, imageUrl, index }: { name: string; tone: string; imageUrl?: string | null; index?: number }) {
  return (
    <div className="tile" data-tone={tone}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" loading="lazy" width={640} height={800} />
      ) : (
        <span className="tile-letter" aria-hidden="true">{initialOf(name)}</span>
      )}
      <span className="tile-wash" aria-hidden="true" />
      {index != null && <span className="tile-index" aria-hidden="true">{String(index).padStart(2, "0")}</span>}
    </div>
  );
}

export function ProductTile({ product, currency, index, featured }: { product: ProductListItem; currency: DisplayCurrency; index?: number; featured?: boolean }) {
  const soldOut = product.stock <= 0;
  const discounted = product.compareAtCents != null && product.compareAtCents > product.priceCents;
  const flag = soldOut ? "Épuisé" : product.condition !== "neuf" ? CONDITION_LABELS[product.condition] : null;

  return (
    <li className={featured ? "featured" : undefined}>
      <Link href={`/produit/${product.slug}`} className="tile-link">
        <div className="tile-frame">
          <TileArt name={product.name} tone={product.tone} imageUrl={product.imageUrl} index={index} />
          {flag && <span className="tile-flag" data-kind={soldOut ? "out" : product.condition}>{flag}</span>}
          <span className="tile-cta" aria-hidden="true">Voir la pièce <span>↗</span></span>
        </div>
        <div className="tile-copy">
          <div>
            <h3 className="tile-name">{product.name}</h3>
            {product.categoryName && <p className="tile-meta">{product.categoryName}</p>}
          </div>
          <p className="price">
            {moneyIn(product.priceCents, currency)}
            {discounted && <span className="price-was"><span className="sr-only">Ancien prix : </span>{moneyIn(product.compareAtCents as number, currency)}</span>}
          </p>
        </div>
      </Link>
    </li>
  );
}
