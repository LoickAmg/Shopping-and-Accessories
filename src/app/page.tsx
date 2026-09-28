import Link from "next/link";

import { Craft, type CraftValue } from "@/components/home/Craft";
import { DomeGallery } from "@/components/home/DomeGallery";
import { HomeMotion } from "@/components/home/HomeMotion";
import { ProductCard } from "@/components/home/ProductCard";
import { Rail } from "@/components/home/Rail";
import { CopyEmail, RollLink } from "@/components/home/RollLink";
import { ScrollText, SplitLetters } from "@/components/home/SplitText";
import { catalogImages, fallbackImage } from "@/components/ProductTile";
import { getSeller } from "@/config/legal";
import { store } from "@/config/store";
import { getDb } from "@/db/client";
import { moneyIn } from "@/lib/format";
import { countByCategory, listCategories, listProducts } from "@/server/catalog";
import { getDisplayCurrency, sweepExpiredOrders } from "@/server/context";

import "./home.css";
import "./home-sheet.css";

const CRAFT: CraftValue[] = [
  {
    word: "Matière",
    lead: "Tout commence par ce que l'on touche. Nous retenons des cuirs qui ont de la main et qui se patinent au lieu de s'user.",
    image: catalogImages[0],
    details: [
      { title: "Cuir pleine fleur", text: "La couche la plus noble de la peau : souple, dense, elle se bonifie avec le temps." },
      { title: "Grains et embossages", text: "Grain serré, saffiano ou croco : des surfaces qui résistent aux rayures du quotidien." },
      { title: "Doublures soignées", text: "Un intérieur net et contrasté, pour retrouver ses affaires d'un coup d'œil." },
    ],
  },
  {
    word: "Ligne",
    lead: "Une silhouette se juge de loin. Structurée ou souple, chaque forme est choisie pour tomber juste, à la main comme à l'épaule.",
    image: catalogImages[3],
    details: [
      { title: "Tenue", text: "Des flancs renforcés qui gardent la forme, même vide, même posé." },
      { title: "Proportions", text: "Des volumes pensés pour un format A4, un ordinateur fin ou l'essentiel du soir." },
      { title: "Portés multiples", text: "Anse courte, bandoulière, chaîne : un même sac, plusieurs façons de le porter." },
    ],
  },
  {
    word: "Détail",
    lead: "Ce qui fait la différence se voit de près : l'éclat d'un fermoir, la régularité d'une couture, le poids d'une boucle.",
    image: catalogImages[4],
    details: [
      { title: "Métal doré", text: "Fermoirs, zips et chaînes à la finition dorée, assortis d'un sac à l'autre." },
      { title: "Coutures régulières", text: "Des points serrés et droits, là où le sac travaille le plus." },
      { title: "Anses gainées", text: "Roulottées ou nouées, pensées pour le confort de la main." },
    ],
  },
  {
    word: "Allure",
    lead: "Au bout du compte, une pièce doit vous ressembler : du bureau au dîner, elle traverse les saisons sans prendre une ride.",
    image: catalogImages[6],
    details: [
      { title: "Intemporel", text: "Des couleurs profondes et des formes classiques qui ne datent pas une tenue." },
      { title: "Du jour au soir", text: "Un détail doré suffit à faire passer un sac de la journée à la soirée." },
      { title: "Peu, mais bien", text: "Une sélection courte : chaque modèle a une raison d'être là." },
    ],
  },
];

const MARQUEE = [
  "Cuir pleine fleur",
  "Fermoirs dorés",
  "Coutures régulières",
  "Chaînes amovibles",
  "Doublures contrastées",
  "Anses gainées",
  "Embossage croco",
  "Livraison soignée",
];

export default async function HomePage() {
  const db = await getDb();
  await sweepExpiredOrders();
  const [categories, counts, catalog, currency] = await Promise.all([
    listCategories(db),
    countByCategory(db),
    listProducts(db, { sort: "recent", pageSize: 24 }),
    getDisplayCurrency(),
  ]);

  const imageOf = (product: { id: number; imageUrl: string | null }) => product.imageUrl || fallbackImage(product.id);
  // Les pièces disponibles ouvrent la sélection ; les épuisées la ferment.
  const available = [...catalog.items].sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0));
  const pieces = available.slice(0, 10).map((product, index) => {
    const discounted = product.compareAtCents != null && product.compareAtCents > product.priceCents;
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      category: product.categoryName,
      price: moneyIn(product.priceCents, currency),
      wasPrice: discounted ? moneyIn(product.compareAtCents as number, currency) : null,
      discountPercent: discounted ? Math.round((1 - product.priceCents / (product.compareAtCents as number)) * 100) : null,
      image: imageOf(product),
      soldOut: product.stock <= 0,
      isNew: index < 2,
    };
  });
  // Chaque rayon est illustré par sa pièce la plus récente.
  const shelves = categories.map((category, index) => {
    const cover = catalog.items.find((product) => product.categoryId === category.id);
    return {
      ...category,
      count: counts.get(category.id) ?? 0,
      image: cover ? imageOf(cover) : catalogImages[index % catalogImages.length],
    };
  });
  const spotlight = catalog.items.find((product) => product.stock > 0 && product.imageUrl) ?? catalog.items[0];
  const seller = getSeller();
  const contactEmail = seller.email.includes("@") ? seller.email : null;
  const year = new Date().getFullYear();

  return (
    <div className="home">
      <HomeMotion />
      <DomeGallery images={catalogImages} />

      <section className="hero" id="intro" aria-labelledby="hero-title">
        <p className="hero-kicker">
          Sacs &amp; accessoires choisis <span aria-hidden="true">→</span> livrés chez vous
        </p>
        <SplitLetters as="h1" id="hero-title" className="hero-title" text={store.name} />
        <p className="hero-script" aria-hidden="true">
          Boutique de mode
        </p>
        <div className="hero-foot">
          <span>Collection {year}</span>
          <a href="#savoir-faire" className="hero-cue">
            <span className="hero-cue-line" aria-hidden="true" />
            Défiler pour découvrir
          </a>
          <Link href="/boutique">Entrer dans la boutique ↗</Link>
        </div>
      </section>

      <div className="home-body">
        <section className="lede" id="savoir-faire" data-lede aria-label="Notre exigence">
          <h2>
            <ScrollText text="Un sac qu'on garde des années ne doit rien au hasard. Il exige :" />
          </h2>
        </section>

        <div className="sheet">
          <section className="sheet-section craft-section" aria-labelledby="craft-title">
            <header className="sheet-head" data-reveal>
              <p className="sheet-eyebrow">Le savoir-faire</p>
              <SplitLetters as="h2" id="craft-title" className="sheet-title" text="Anatomie d'une pièce" />
            </header>
            <Craft values={CRAFT} />
          </section>

          <div className="marquee" aria-hidden="true">
            <div className="marquee-track">
              {[0, 1].map((copy) => (
                <span className="marquee-group" key={copy}>
                  {MARQUEE.map((word) => (
                    <span className="marquee-item" key={word}>
                      {word}
                      <span className="marquee-dot" />
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>

          <section className="sheet-section" id="pieces" aria-labelledby="pieces-title">
            <header className="sheet-head sheet-head-row" data-reveal>
              <div>
                <p className="sheet-eyebrow">La sélection</p>
                <SplitLetters as="h2" id="pieces-title" className="sheet-title" text="Pièces phares" />
              </div>
              <Link href="/boutique" className="sheet-link">
                Tout voir <span aria-hidden="true">→</span>
              </Link>
            </header>
            {pieces.length === 0 ? (
              <p className="empty">Le catalogue est vide pour le moment.</p>
            ) : (
              <Rail label="Pièces phares" className="hrail-products">
                {pieces.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </Rail>
            )}
          </section>

          {spotlight && (
            <section className="sheet-section" aria-labelledby="spotlight-title">
              <Link href={`/produit/${spotlight.slug}`} className="spotlight" data-reveal>
                <div className="spotlight-copy">
                  <p className="sheet-eyebrow">Nouvelle collection · Automne — Hiver {year}</p>
                  <h2 id="spotlight-title" className="spotlight-title">
                    Le cuir, <em>en majesté</em>
                  </h2>
                  <p className="spotlight-text">
                    {spotlight.summary || "Une pièce choisie pour sa tenue et ses finitions."} À découvrir :{" "}
                    <strong>{spotlight.name}</strong>.
                  </p>
                  <span className="spotlight-cta">
                    Découvrir la pièce <span aria-hidden="true">→</span>
                  </span>
                </div>
                <div className="spotlight-media" aria-hidden="true">
                  <span className="spotlight-disc" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="cutout" src={imageOf(spotlight)} alt="" loading="lazy" width={810} height={1080} />
                </div>
              </Link>
            </section>
          )}

          {shelves.length > 0 && (
            <section className="sheet-section" id="rayons" aria-labelledby="rayons-title">
              <header className="sheet-head sheet-head-row" data-reveal>
                <div>
                  <p className="sheet-eyebrow">Par envie</p>
                  <SplitLetters as="h2" id="rayons-title" className="sheet-title" text="Les rayons" />
                </div>
                <Link href="/boutique" className="sheet-link">
                  Tout le catalogue <span aria-hidden="true">→</span>
                </Link>
              </header>
              <Rail label="Les rayons" className="hrail-shelves">
                {shelves.map((shelf, index) => (
                  <li className="shelf-card" key={shelf.id} data-tint={index % 3}>
                    <Link href={`/boutique?categorie=${shelf.slug}`} draggable={false}>
                      <span className="shelf-card-media">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="cutout" src={shelf.image} alt="" loading="lazy" draggable={false} width={405} height={540} />
                        <span className="shelf-card-count">
                          {shelf.count} pièce{shelf.count > 1 ? "s" : ""}
                        </span>
                      </span>
                      <span className="shelf-card-name">
                        {shelf.name} <span aria-hidden="true">→</span>
                      </span>
                      {shelf.description && <span className="shelf-card-desc">{shelf.description}</span>}
                    </Link>
                  </li>
                ))}
                <li className="shelf-card shelf-card-all">
                  <Link href="/boutique" draggable={false}>
                    <span className="shelf-card-media">
                      <span className="shelf-card-all-text">
                        Tout
                        <br />
                        le catalogue <span aria-hidden="true">↗</span>
                      </span>
                    </span>
                    <span className="shelf-card-name">
                      {catalog.total} pièce{catalog.total > 1 ? "s" : ""} <span aria-hidden="true">→</span>
                    </span>
                  </Link>
                </li>
              </Rail>
            </section>
          )}
        </div>

        <section className="about" id="maison" aria-labelledby="about-title">
          <div className="about-grid">
            <h2 id="about-title" className="about-title" data-reveal>
              L&apos;élégance du quotidien, choisie pièce par pièce
            </h2>
            <div className="about-copy" data-reveal>
              <p className="about-lead">{store.description}</p>
              <p>
                Chaque sac est sélectionné pour sa tenue, la qualité de ses finitions et sa capacité à accompagner une
                garde-robe sans jamais la dater. Peu de modèles, mais les bons.
              </p>
              <p>
                Paiement sécurisé, stock réservé dès la commande et suivi jusqu&apos;à la livraison : la boutique est pensée
                pour que l&apos;achat soit aussi simple que le choix.
              </p>
              <p className="about-sign" aria-hidden="true">
                Shopping &amp; Accessories
              </p>
              <Link href="/a-propos" className="pill-link">
                La maison <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </section>

        <section className="outro" aria-labelledby="outro-title">
          <div className="outro-glow" aria-hidden="true" />
          <h2 className="outro-title" id="outro-title" data-reveal>
            <span>Votre prochaine pièce</span>
            <span>vous attend</span>
          </h2>
          <div className="outro-links" data-reveal>
            <RollLink href="/boutique" text="Boutique" className="outro-roll" />
            {contactEmail ? <CopyEmail email={contactEmail} /> : <RollLink href="/contact" text="Contact" className="outro-roll" />}
          </div>
          <p className="outro-fine">© {year} {store.name}</p>
        </section>
      </div>
    </div>
  );
}
