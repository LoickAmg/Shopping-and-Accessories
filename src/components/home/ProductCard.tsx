import Link from "next/link";

import { addToCartAction } from "@/app/actions/cart";

export interface ProductCardData {
  id: number;
  slug: string;
  name: string;
  category: string | null;
  price: string;
  wasPrice: string | null;
  discountPercent: number | null;
  image: string;
  soldOut: boolean;
  isNew: boolean;
}

/** « Sac Trapèze Croco, bleu nuit » → nom et déclinaison, présentés sur deux niveaux. */
function splitName(name: string): [string, string | null] {
  const comma = name.lastIndexOf(",");
  return comma > 0 ? [name.slice(0, comma), name.slice(comma + 1).trim()] : [name, null];
}

/**
 * Fiche produit du rail d'accueil : photo détourée sur fond sable, pastilles,
 * ajout rapide au panier qui apparaît au survol (toujours visible au tactile).
 */
export function ProductCard({ product }: { product: ProductCardData }) {
  const [title, variant] = splitName(product.name);
  const href = `/produit/${product.slug}`;

  return (
    <li className="pcard">
      <div className="pcard-media">
        <Link href={href} className="pcard-image" tabIndex={-1} aria-hidden="true" draggable={false}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cutout" src={product.image} alt="" loading="lazy" draggable={false} width={405} height={540} />
        </Link>
        <div className="pcard-badges">
          {product.isNew && <span className="badge">Nouveau</span>}
          {product.discountPercent != null && <span className="badge badge-rose">−{product.discountPercent} %</span>}
          {product.soldOut && <span className="badge badge-muted">Épuisé</span>}
        </div>
        {product.soldOut ? (
          <Link href={href} className="pcard-quick">
            Voir la pièce <span aria-hidden="true">→</span>
          </Link>
        ) : (
          <form action={addToCartAction} className="pcard-quick-form">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="slug" value={product.slug} />
            <input type="hidden" name="quantity" value={1} />
            <button type="submit" className="pcard-quick" aria-label={`Ajouter ${product.name} au panier`}>
              Ajouter au panier <span aria-hidden="true">+</span>
            </button>
          </form>
        )}
      </div>
      <Link href={href} className="pcard-info" draggable={false}>
        <span className="pcard-name">
          <strong>{title}</strong>
          {variant && <span> — {variant}</span>}
        </span>
        {product.category && <span className="pcard-cat">{product.category}</span>}
        <span className="pcard-price">
          {product.price}
          {product.wasPrice && (
            <s>
              <span className="sr-only">Ancien prix : </span>
              {product.wasPrice}
            </s>
          )}
        </span>
      </Link>
    </li>
  );
}
