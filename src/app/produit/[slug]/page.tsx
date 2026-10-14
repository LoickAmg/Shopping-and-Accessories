import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { addToCartAction } from "@/app/actions/cart";
import { ProductTile, TileArt } from "@/components/ProductTile";
import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { moneyIn } from "@/lib/format";
import { CONDITION_LABELS, DEPARTMENT_LABELS, WEAR_GRADE_LABELS, hasRealVariants, variantLabel } from "@/lib/taxonomy";
import { MAX_PER_LINE } from "@/server/cart";
import { getProductBySlug, listRelated } from "@/server/catalog";
import { getDisplayCurrency } from "@/server/context";

const LOW_STOCK = 5;

export async function generateMetadata({ params }: PageProps<"/produit/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(await getDb(), slug);
  if (!product) return { title: "Produit introuvable", robots: { index: false } };
  return {
    title: product.name,
    description: product.summary || store.description,
    alternates: { canonical: `/produit/${product.slug}` },
    openGraph: { type: "website", title: product.name, description: product.summary || undefined, ...(product.imageUrl ? { images: [product.imageUrl] } : {}) },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<"/produit/[slug]">) {
  const { slug } = await params;
  const flags = await searchParams;
  const db = await getDb();
  const product = await getProductBySlug(db, slug);
  if (!product) notFound();

  const [related, currency] = await Promise.all([listRelated(db, product), getDisplayCurrency()]);
  const soldOut = product.stock <= 0;
  const discounted = product.compareAtCents != null && product.compareAtCents > product.priceCents;
  const sized = hasRealVariants(product.variants);
  const inStock = product.variants.filter((variant) => variant.stock > 0);
  // Taille présélectionnée : la seule disponible, ou aucune (le client choisit).
  const preselected = inStock.length === 1 ? inStock[0].id : undefined;
  const single = !sized ? product.variants[0] : undefined;
  const maxQuantity = Math.min(single ? single.stock : Math.max(0, ...inStock.map((variant) => variant.stock)), MAX_PER_LINE);
  const secondHand = product.condition === "seconde_main";
  const photos = [product.imageUrl, ...product.gallery].filter((url): url is string => Boolean(url));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.summary || product.description,
    sku: product.sku ?? String(product.id),
    ...(product.material ? { material: product.material } : {}),
    itemCondition: secondHand ? "https://schema.org/UsedCondition" : "https://schema.org/NewCondition",
    offers: {
      "@type": "Offer",
      priceCurrency: store.currency.code,
      price: (product.priceCents / 10 ** store.currency.exponent).toFixed(store.currency.exponent),
      availability: soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ol className="breadcrumb" aria-label="Fil d'Ariane">
        <li><Link href="/boutique">Boutique</Link></li>
        <li><Link href={`/boutique?univers=${product.department}`}>{DEPARTMENT_LABELS[product.department]}</Link></li>
        {product.categoryName && <li><Link href={`/boutique?categorie=${product.categorySlug}`}>{product.categoryName}</Link></li>}
        <li aria-current="page">{product.name}</li>
      </ol>
      <article className="product">
        <div className="product-media">
          <TileArt name={product.name} tone={product.tone} imageUrl={product.imageUrl} />
          {photos.length > 1 && (
            <ul className="product-gallery" aria-label="Autres photos">
              {photos.slice(1).map((url, index) => (
                <li key={url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`${product.name}, photo ${index + 2}`} loading="lazy" width={405} height={540} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="product-copy">
          <p className="eyebrow">
            {[DEPARTMENT_LABELS[product.department], product.categoryName].filter(Boolean).join(" · ")}
          </p>
          <h1>{product.name}</h1>
          <div className="product-badges">
            {product.condition !== "neuf" && <span className={`condition-badge condition-${product.condition}`}>{CONDITION_LABELS[product.condition]}</span>}
            {secondHand && product.wearGrade && <span className="condition-badge">{WEAR_GRADE_LABELS[product.wearGrade]}</span>}
            {product.material && <span className="condition-badge condition-quiet">{product.material}</span>}
          </div>
          {product.summary && <p className="product-summary">{product.summary}</p>}
          <p className="product-price">{moneyIn(product.priceCents, currency)}{discounted && <span className="price-was"><span className="sr-only">Ancien prix : </span>{moneyIn(product.compareAtCents as number, currency)}</span>}</p>
          {currency.code !== store.currency.code && <p className="muted small">Prix converti depuis {store.currency.code}, à titre indicatif. Le montant facturé en {currency.code} est celui affiché au moment du paiement.</p>}
          {soldOut ? (
            <p className="stock-line out">Épuisé pour le moment.</p>
          ) : secondHand && product.stock === 1 ? (
            <p className="stock-line low">Pièce unique.</p>
          ) : !sized && product.stock <= LOW_STOCK ? (
            <p className="stock-line low">Plus que {product.stock} en stock.</p>
          ) : (
            <p className="stock-line">En stock.</p>
          )}
          {secondHand && product.defects && (
            <div className="notice defects" role="note">
              <strong>À savoir avant d&apos;acheter :</strong> {product.defects}
            </div>
          )}
          {flags.ajoute && <p className="notice notice-ok" role="status">Ajouté au panier. <Link href="/panier">Voir le panier</Link></p>}
          {flags.indisponible && <p className="notice notice-error" role="alert">Cette taille n&apos;est plus disponible : choisissez-en une autre.</p>}
          {flags.taille && <p className="notice notice-error" role="alert">Choisissez une taille avant d&apos;ajouter au panier.</p>}
          {!soldOut && (
            <form action={addToCartAction} className="product-buy">
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="slug" value={product.slug} />
              {single ? (
                <input type="hidden" name="variantId" value={single.id} />
              ) : (
                <fieldset className="size-picker">
                  <legend>Taille{product.variants.some((variant) => variant.color) ? " et couleur" : ""}</legend>
                  <div className="size-options">
                    {product.variants.map((variant) => {
                      const label = variantLabel(variant).replace(/^Taille /, "");
                      const out = variant.stock <= 0;
                      return (
                        <label key={variant.id} className="size-option" data-out={out ? "true" : undefined}>
                          <input type="radio" name="variantId" value={variant.id} disabled={out} defaultChecked={variant.id === preselected} required />
                          <span>
                            {label}
                            {out ? <span className="sr-only"> (épuisé)</span> : variant.stock <= 2 ? <small> · plus que {variant.stock}</small> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
              <div className="field"><label htmlFor="quantity">Quantité</label><input id="quantity" className="quantity" type="number" name="quantity" min={1} max={maxQuantity} defaultValue={1} required /></div>
              <button type="submit" className="button">Ajouter au panier <span aria-hidden="true">↗</span></button>
            </form>
          )}
          {product.description && <div className="prose"><h2>Description</h2><p>{product.description}</p></div>}
          {secondHand && (
            <div className="prose">
              <h2>Friperie</h2>
              <p>Pièce de seconde main. Son état et ses éventuels défauts sont décrits ci-dessus : prenez le temps de regarder les photos avant d&apos;acheter.</p>
            </div>
          )}
        </div>
      </article>
      {related.length > 0 && <section aria-labelledby="related-title" className="related-section"><div className="section-head"><h2 id="related-title">Vous aimerez aussi</h2></div><ul className="grid">{related.map((item) => <ProductTile key={item.id} product={item} currency={currency} />)}</ul></section>}
    </>
  );
}
