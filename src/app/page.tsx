import Link from "next/link";

import { Craft, type CraftValue } from "@/components/home/Craft";
import { DomeGallery } from "@/components/home/DomeGallery";
import { HomeMotion } from "@/components/home/HomeMotion";
import { ProductCard } from "@/components/home/ProductCard";
import { Rail } from "@/components/home/Rail";
import { CopyEmail, RollLink } from "@/components/home/RollLink";
import { ScrollText, SplitLetters } from "@/components/home/SplitText";
import { catalogImages } from "@/components/ProductTile";
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
    lead: "Tout commence par ce que l'on touche : un coton qui tient, un lin qui respire, un cuir qui se patine.",
    image: catalogImages[0],
    details: [
      { title: "Fibres naturelles", text: "Coton, lin, laine : des matières qui respirent et se portent longtemps." },
      { title: "Cuirs et embossages", text: "Grain serré, saffiano ou croco : des surfaces qui résistent au quotidien." },
      { title: "Métaux des bijoux", text: "Acier inoxydable, plaqué or, argent : la matière est indiquée sur chaque fiche." },
    ],
  },
  {
    word: "Ligne",
    lead: "Une coupe se juge de loin : ajustée ou ample, chaque pièce est choisie pour tomber juste, de jour comme de soir.",
    image: catalogImages[3],
    details: [
      { title: "Coupes", text: "Ajustées ou amples, des silhouettes pensées pour bouger avec vous." },
      { title: "Du XS au XXL", text: "Des tailles de l'enfant à l'adulte, indiquées sur chaque fiche avec leur disponibilité." },
      { title: "Portés multiples", text: "Anse courte, bandoulière, chaîne : un même sac, plusieurs façons de le porter." },
    ],
  },
  {
    word: "Détail",
    lead: "Ce qui fait la différence se voit de près : une couture régulière, un bouton bien cousu, un fermoir qui accroche la lumière.",
    image: catalogImages[4],
    details: [
      { title: "Finitions", text: "Coutures régulières et ourlets nets, là où une pièce travaille le plus." },
      { title: "Boutons et fermoirs", text: "Les petites pièces de métal qui font la grande différence d'une tenue." },
      { title: "Friperie décrite honnêtement", text: "L'état d'usure et les défauts éventuels sont indiqués sur chaque fiche de seconde main." },
    ],
  },
  {
    word: "Allure",
    lead: "Au bout du compte, une pièce doit vous ressembler : du bureau au dîner, elle traverse les saisons sans prendre une ride.",
    image: catalogImages[6],
    details: [
      { title: "Intemporel", text: "Des couleurs profondes et des formes classiques qui ne datent pas une tenue." },
      { title: "Du jour au soir", text: "Un détail doré suffit à faire passer une tenue de la journée à la soirée." },
      { title: "Neuf, friperie ou fin de série", text: "Trois façons de s'habiller avec style, selon votre budget." },
    ],
  },
];

const MARQUEE = ["Femme", "Homme", "Enfant", "Friperie", "Fins de série", "Bijoux", "Sacs", "Du XS au XXL", "Livraison soignée"];

export default async function HomePage() {
  const db = await getDb();
  await sweepExpiredOrders();
  const [categories, counts, catalog, currency] = await Promise.all([
    listCategories(db),
    countByCategory(db),
    listProducts(db, { sort: "recent", pageSize: 24 }),
    getDisplayCurrency(),
  ]);

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
      image: product.imageUrl,
      tone: product.tone,
      soldOut: product.stock <= 0,
      isNew: index < 2,
      // Ajout direct au panier seulement pour un article sans choix de taille.
      quickVariantId: product.singleVariantId,
      condition: product.condition,
    };
  });
  // Seuls les rayons garnis apparaissent, illustrés par la photo de leur pièce la plus récente.
  const shelves = categories
    .filter((category) => (counts.get(category.id) ?? 0) > 0)
    .map((category) => {
      const cover = catalog.items.find((product) => product.categoryId === category.id && product.imageUrl);
      return { ...category, count: counts.get(category.id) ?? 0, image: cover?.imageUrl ?? null };
    });
  const spotlight = catalog.items.find((product) => product.stock > 0 && product.imageUrl);
  const seller = getSeller();
  const contactEmail = seller.email.includes("@") ? seller.email : null;
  const year = new Date().getFullYear();

  return (
    <div className="home">
      <HomeMotion />
      <DomeGallery images={catalogImages} />

      <section className="hero" id="intro" aria-labelledby="hero-title">
        <p className="hero-kicker">
          Mode, friperie &amp; bijoux choisis <span aria-hidden="true">→</span> livrés chez vous
        </p>
        <SplitLetters as="h1" id="hero-title" className="hero-title" text={store.name} />
        <div className="ornament hero-ornament" aria-hidden="true">
          <span />
        </div>
        <p className="hero-script">Boutique de Mode &amp; Accessoires</p>
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
            <ScrollText text="Une pièce qu'on garde des années ne doit rien au hasard. Elle exige :" />
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
                    La pièce, <em>en majesté</em>
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
                  <img className="cutout" src={spotlight.imageUrl ?? ""} alt="" loading="lazy" width={810} height={1080} />
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
                        {shelf.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="cutout" src={shelf.image} alt="" loading="lazy" draggable={false} width={405} height={540} />
                        ) : (
                          <span className="shelf-card-letter" aria-hidden="true">
                            {shelf.name.charAt(0)}
                          </span>
                        )}
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
