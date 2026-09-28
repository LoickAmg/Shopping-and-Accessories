# Shopping & Accessories

Boutique en ligne de sacs et d'accessoires de mode : vitrine immersive, catalogue, panier, comptes clients, commande avec réservation de stock, paiement et back-office. Le site se déploie gratuitement sur Vercel avec une base Postgres Neon.

- [Aperçu](#aperçu)
- [Fonctionnalités](#fonctionnalités)
- [Démarrer en local](#démarrer-en-local)
- [Structure du projet](#structure-du-projet)
- [Personnaliser la boutique](#personnaliser-la-boutique)
- [Déployer sur Vercel](#déployer-sur-vercel)
- [Variables d'environnement](#variables-denvironnement)
- [Paiement](#paiement)
- [Devises](#devises)
- [Sécurité](#sécurité)
- [Limites connues](#limites-connues)

## Aperçu

La direction artistique est noire, crème et or, avec des touches de beige et de rose poudré reprises du logo. Les titres sont en capitales condensées et la signature en écriture manuscrite.

La page d'accueil se lit dans cet ordre :

1. **Hero** : les photos des sacs recouvrent l'intérieur d'un dôme en fond. Le dôme dérive lentement, suit la souris et se fait glisser à la souris ou au doigt. Le titre s'écrit lettre par lettre.
2. **Introduction** : une phrase dont les lettres s'allument au fil du défilement.
3. **Anatomie d'une pièce** : quatre exigences (Matière, Ligne, Détail, Allure) en onglets qui avancent seuls. Chacune montre un sac et trois détails de fabrication.
4. **Pièces phares** : un rail de fiches produit avec pastilles (Nouveau, remise, Épuisé), prix barré et ajout rapide au panier.
5. **Collection** : une bannière qui met une pièce en avant.
6. **Les rayons** : une vignette par rayon, avec son nombre de pièces.
7. **La maison**, puis un **appel final** vers la boutique et le contact.

Le menu en pilule suit la section affichée. Sur mobile, il passe en bas de l'écran.

Les animations respectent le réglage « réduire les animations » du système. Sans JavaScript, tout le contenu reste lisible.

## Fonctionnalités

- **Catalogue** : rayons, recherche insensible aux accents, tri, filtre « en stock », pagination, prix barrés, fiches produit avec données structurées.
- **Panier** : fonctionne sans compte (cookie) et fusionne avec celui du compte à la connexion. Les quantités sont plafonnées par le stock et les articles devenus indisponibles sont signalés.
- **Commande** : validation côté serveur, adresse, choix du paiement, acceptation des conditions de vente.
- **Stock** : il est réservé dans une transaction (`UPDATE … WHERE stock >= quantité`), donc deux acheteurs ne peuvent pas se partager la dernière pièce. Une commande impayée expire après 30 minutes (réglable) et rend son stock.
- **Comptes clients** : inscription, connexion et historique des commandes. Les mots de passe sont hachés avec `scrypt`.
- **Back-office** (`/admin`, réservé au compte dont l'e-mail est `ADMIN_EMAIL`) :
  - tableau de bord ;
  - produits (créer, modifier, archiver) et rayons ;
  - commandes : expédier, annuler, enregistrer un paiement reçu hors ligne, solder un remboursement ;
  - devises.
- **Pages légales** : mentions légales, conditions de vente, confidentialité, livraison et retours, contact, à propos. L'identité du vendeur vient des variables d'environnement.
- **Accessibilité et référencement** : navigation au clavier, lien d'évitement, formulaires étiquetés avec erreurs annoncées, `robots.txt`, `sitemap.xml`, Open Graph.

## Stack

- **Next.js 16** (App Router, Server Actions) et **TypeScript** strict.
- **Postgres** avec **Drizzle ORM** : Neon en production, PGlite (Postgres embarqué) en local et dans les tests.
- **Zod** pour la validation.
- **CSS écrit à la main**, sans framework.
- **Lenis** pour le défilement amorti de l'accueil.
- **Polices auto-hébergées** : Anton (titres), Mrs Saint Delafield (signature), Hanken Grotesk (texte).
- **Vitest** : les tests tournent sur un vrai Postgres en mémoire.

## Démarrer en local

Il faut Node.js 22 ou plus récent.

```bash
npm install
npm run dev
```

Le site est alors disponible sur http://localhost:3000.

Sans `DATABASE_URL`, une base embarquée est créée dans `.pglite/`, migrée, puis garnie du catalogue de démonstration.

Pour accéder au back-office, créez un fichier `.env.local` contenant :

```
ADMIN_EMAIL=vous@exemple.test
```

Inscrivez-vous ensuite sur le site avec cette adresse : ce compte devient administrateur.

### Commandes utiles

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm test` | Tests (Vitest) |
| `npm run lint` | Lint (ESLint) |
| `npm run typecheck` | Vérification des types |
| `npm run build` | Build de production (vérifie d'abord les variables obligatoires) |
| `npm run db:generate` | Génère une migration après un changement de `src/db/schema.ts` |
| `npm run db:migrate` | Applique les migrations sur `DATABASE_URL` |
| `npm run db:seed` | Charge le catalogue de démonstration dans une base vide |

## Structure du projet

```
public/assets/         Photos des produits et logo servis par le site
assets/                Photos d'origine
src/app/               Pages (App Router) et Server Actions
  page.tsx             Page d'accueil
  globals.css          Styles de base
  theme.css            Direction artistique commune à tout le site
  home.css             Accueil : dôme, hero, maison, appel final
  home-sheet.css       Accueil : savoir-faire, pièces phares, rayons
src/components/        Composants partagés (en-tête, pied de page, vignettes…)
  home/                Composants de l'accueil (dôme, onglets, rails, animations)
src/config/            Identité de la boutique, mentions légales
src/db/                Schéma Drizzle, connexion, catalogue de démonstration
src/server/            Logique métier : catalogue, panier, commandes, admin
src/payments/          Fournisseurs de paiement (demo, stripe)
drizzle/               Migrations SQL
tests/                 Tests Vitest
```

## Personnaliser la boutique

- **Produits et rayons** : gérez-les depuis `/admin`. Pour chaque produit, renseignez l'adresse de sa photo, par exemple `/assets/product-1.jpeg`.
- **Photos** : déposez-les dans `public/assets/`. Des photos sur fond blanc donnent le meilleur rendu : le site les fond dans des fonds sable ou rose, ce qui fait paraître les sacs détourés.
- **Catalogue de démonstration** : il se trouve dans `src/db/seed.ts` (8 sacs en 3 rayons). Les prix et descriptions sont des exemples à remplacer.
- **Textes de l'accueil** : ils sont dans `src/app/page.tsx` (exigences du savoir-faire, bandeau défilant, bannière de collection).
- **Nom, slogan et description** : réglez-les avec `SHOP_NAME`, `SHOP_TAGLINE` et `SHOP_DESCRIPTION`.
- **Couleurs** : elles sont définies sous forme de variables en tête de `src/app/theme.css` (site) et de `src/app/home-sheet.css` (partie claire de l'accueil).

## Déployer sur Vercel

1. **Base de données** : créez un projet [Neon](https://neon.tech) (offre gratuite), ou ajoutez l'intégration Neon depuis le tableau de bord Vercel. Elle renseigne `DATABASE_URL` toute seule.
2. **Projet** : importez ce dépôt dans Vercel. Le script `vercel-build` applique les migrations, puis construit le site.
3. **Variables** : renseignez-les dans *Settings → Environment Variables* (voir la section suivante). Sans les variables obligatoires, le build échoue volontairement.
4. **Catalogue** : sur une base de production vide, posez `SEED_DEMO_CATALOG=true` pour charger le catalogue de démonstration au premier déploiement. Vous pouvez aussi lancer `npm run db:seed` avec `DATABASE_URL`, ou créer directement vos produits dans `/admin`.
5. **Administration** : ouvrez le site et inscrivez-vous avec l'adresse `ADMIN_EMAIL`.

## Variables d'environnement

Le fichier `.env.example` liste toutes les variables, avec un commentaire pour chacune.

**Obligatoires en production :**

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion Postgres (Neon) |
| `APP_SECRET` | Secret aléatoire d'au moins 32 caractères |
| `ADMIN_EMAIL` | Adresse du compte administrateur |
| `SHOP_LEGAL_NAME` | Nom légal du vendeur (mentions légales) |
| `SHOP_CONTACT_EMAIL` | E-mail de contact (pages légales et bouton « copier l'e-mail » de l'accueil) |

**Principales variables facultatives :**

| Variable | Rôle |
| --- | --- |
| `SHOP_CURRENCY` | `XOF` par défaut ; `EUR` ou `USD` possibles |
| `SHOP_COUNTRIES` | Pays livrés, en codes ISO séparés par des virgules |
| `SHOP_DEMO_NOTICE` | `false` pour passer en vente réelle |
| `PAYMENT_PROVIDERS` | `demo`, `stripe`, ou les deux |
| `RESEND_API_KEY`, `MAIL_FROM` | Envoi réel des e-mails de confirmation |
| `SITE_URL` | URL publique (déduite automatiquement sur Vercel) |

Pour générer `APP_SECRET` :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Paiement

- **Mode test (par défaut)** : `PAYMENT_PROVIDERS=demo`. Aucun argent ne circule, et une pastille l'indique aux visiteurs.
- **Stripe** :
  - posez `PAYMENT_PROVIDERS=stripe` (ou `demo,stripe`), `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` ;
  - déclarez `https://votre-domaine/api/webhooks/stripe` dans Stripe, avec l'événement `checkout.session.completed` ;
  - une clé `sk_live_` est refusée tant que `ALLOW_LIVE_PAYMENTS=true` n'est pas posé.
- **Vente réelle** : `SHOP_DEMO_NOTICE=false` désactive le paiement de démonstration. Relisez les pages légales avec votre situation (statut, conditions de vente, fiscalité).
- **Paiement reçu hors ligne** (virement, espèces, mobile money manuel) : utilisez le bouton « Enregistrer le paiement » sur la commande, dans l'administration.
- **Autres fournisseurs** (FedaPay, KKiaPay, mobile money) : implémentez l'interface `PaymentProvider` de `src/payments/types.ts`. Elle a deux méthodes :
  - `createPayment` renvoie l'adresse de paiement ;
  - `parseWebhook` vérifie la signature et traduit l'événement.

  Le reste est déjà en place : idempotence, contrôle du montant, stock, e-mail.

Le montant et la devise encaissés doivent correspondre exactement à ceux de la commande. Un webhook rejoué n'a aucun effet.

## Devises

Les prix du catalogue sont saisis dans la devise de base (`SHOP_CURRENCY`). Les montants sont toujours des entiers en unité mineure : aucun nombre à virgule n'entre dans un calcul d'argent.

Pour proposer d'autres devises (XOF, USD, EUR) :

1. Dans `/admin/devises`, saisissez un taux, par exemple « 1 XOF = 0,0016 USD ».
2. Cochez « Proposer aux visiteurs ».

Un sélecteur apparaît alors dans l'en-tête. Le client est facturé dans la devise choisie, et cette devise est enregistrée sur la commande. Les taux se saisissent à la main : il n'y a pas de flux de change en direct.

## Sécurité

- Les actions du back-office sont revérifiées côté serveur, pas seulement masquées dans l'interface.
- Les sessions utilisent un jeton haché et les mots de passe sont hachés avec `scrypt`.
- Une limitation de débit en base protège la connexion, l'inscription et la commande, sans stocker d'adresse IP ni d'e-mail en clair.
- Les redirections de retour sont limitées aux chemins internes. Une commande n'est consultable sans compte qu'avec son jeton secret.
- Le site envoie des en-têtes de sécurité, et les pages privées ne sont pas indexées.
- Un paiement reçu pour une commande qu'on ne peut plus honorer est signalé « remboursement à faire » dans le back-office.

## Limites connues

- **Commandes expirées** : sur l'offre gratuite de Vercel, il n'y a pas de tâche planifiée. Leur nettoyage se fait donc au fil des visites.
- **Tests de concurrence** : les tests tournent sur PGlite, qui n'accepte qu'une connexion. La garantie de non-survente en concurrence réelle repose sur la condition `UPDATE … WHERE stock >= n` de Postgres, pas sur un test multi-connexions.
- **Sans configuration e-mail**, la confirmation de commande est écrite dans les journaux au lieu d'être envoyée.

## Licence

[MIT](LICENSE)
