import Link from "next/link";

import type { Currency } from "@/db/schema";
import { initialOf, moneyIn } from "@/lib/format";
import type { ProductListItem } from "@/server/catalog";

type DisplayCurrency = Pick<Currency, "code" | "exponent" | "rateMicros">;

export const catalogImages = Array.from({ length: 8 }, (_, index) => `/assets/product-${index + 1}.jpeg`);

export function fallbackImage(productId: number): string {
  return catalogImages[Math.abs(productId - 1) % catalogImages.length];
}

/** Image éditoriale avec un fallback visuel pour les produits sans photo en base. */
export function TileArt({ name, tone, imageUrl, index, productId }: { name: string; tone: string; imageUrl?: string | null; index?: number; productId?: number }) {
  const resolvedImage = imageUrl || (productId ? fallbackImage(productId) : undefined);

  return (
    <div className="tile" data-tone={tone}>
      {resolvedImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={resolvedImage} alt="" loading="lazy" width={640} height={800} />
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

  return (
    <li className={featured ? "featured" : undefined}>
      <Link href={`/produit/${product.slug}`} className="tile-link">
        <div className="tile-frame">
          <TileArt name={product.name} tone={product.tone} imageUrl={product.imageUrl} productId={product.id} index={index} />
          {soldOut && <span className="tile-flag">Épuisé</span>}
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
