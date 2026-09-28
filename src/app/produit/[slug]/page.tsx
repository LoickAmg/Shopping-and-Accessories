import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { addToCartAction } from "@/app/actions/cart";
import { ProductTile, TileArt } from "@/components/ProductTile";
import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { moneyIn } from "@/lib/format";
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
  const maxQuantity = Math.min(product.stock, MAX_PER_LINE);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.summary || product.description,
    sku: product.sku ?? String(product.id),
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
        {product.categoryName && <li><Link href={`/boutique?categorie=${product.categorySlug}`}>{product.categoryName}</Link></li>}
        <li aria-current="page">{product.name}</li>
      </ol>
      <article className="product">
        <TileArt name={product.name} tone={product.tone} imageUrl={product.imageUrl} productId={product.id} />
        <div className="product-copy">
          {product.categoryName && <p className="eyebrow">{product.categoryName}</p>}
          <h1>{product.name}</h1>
          {product.summary && <p className="product-summary">{product.summary}</p>}
          <p className="product-price">{moneyIn(product.priceCents, currency)}{discounted && <span className="price-was"><span className="sr-only">Ancien prix : </span>{moneyIn(product.compareAtCents as number, currency)}</span>}</p>
          {currency.code !== store.currency.code && <p className="muted small">Prix converti depuis {store.currency.code}, à titre indicatif. Le montant facturé en {currency.code} est celui affiché au moment du paiement.</p>}
          {soldOut ? <p className="stock-line out">Épuisé pour le moment.</p> : product.stock <= LOW_STOCK ? <p className="stock-line low">Plus que {product.stock} en stock.</p> : <p className="stock-line">En stock.</p>}
          {flags.ajoute && <p className="notice notice-ok" role="status">Ajouté au panier. <Link href="/panier">Voir le panier</Link></p>}
          {flags.indisponible && <p className="notice notice-error" role="alert">Cet article n&apos;est plus disponible.</p>}
          {!soldOut && <form action={addToCartAction} className="product-buy">
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="slug" value={product.slug} />
            <div className="field"><label htmlFor="quantity">Quantité</label><input id="quantity" className="quantity" type="number" name="quantity" min={1} max={maxQuantity} defaultValue={1} required /></div>
            <button type="submit" className="button">Ajouter au panier <span aria-hidden="true">↗</span></button>
          </form>}
          {product.description && <div className="prose"><h2>Description</h2><p>{product.description}</p></div>}
        </div>
      </article>
      {related.length > 0 && <section aria-labelledby="related-title" className="related-section"><div className="section-head"><h2 id="related-title">Vous aimerez aussi</h2></div><ul className="grid">{related.map((item) => <ProductTile key={item.id} product={item} currency={currency} />)}</ul></section>}
    </>
  );
}
