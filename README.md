# Étal

Boutique en ligne complète, thémable et déployable gratuitement sur Vercel : catalogue, panier, comptes clients, commande avec réservation de stock, paiement par fournisseurs branchables, e-mail de confirmation et back-office.

Le nom, l'identité visuelle, la devise et les fournisseurs de paiement se règlent par variables d'environnement : la même base sert une papeterie, une épicerie ou un atelier.

## Ce qu'elle fait

- **Vitrine** : accueil éditorial, catalogue avec rayons, recherche insensible aux accents, tri, filtre « en stock », pagination, fiches produit avec données structurées, prix barrés.
- **Panier** : sans compte (cookie), fusionné avec celui du compte à la connexion ; quantités plafonnées par le stock ; articles devenus indisponibles signalés.
- **Commande** : validation côté serveur, adresse, paiement, conditions de vente acceptées. Le **stock est réservé** dans une transaction (`UPDATE … WHERE stock >= quantité`) : deux acheteurs ne peuvent jamais se partager la dernière pièce. Une commande impayée expire après 30 minutes (réglable) et rend son stock.
- **Paiement** : interface `PaymentProvider` (deux méthodes). Fournisseurs livrés : `demo` (simulateur intégré) et `stripe` (Checkout, écrit sans SDK, signature de webhook vérifiée). Le montant et la devise encaissés doivent être exactement ceux de la commande ; un webhook rejoué n'a aucun effet.
- **Comptes** : inscription, connexion, historique des commandes. Mots de passe hachés en `scrypt`, sessions à jeton haché, limitation de débit partagée en base.
- **Back-office** (`/admin`, réservé au compte dont l'e-mail est `ADMIN_EMAIL`) : tableau de bord, produits (créer, modifier, archiver), rayons, commandes (expédier, annuler, marquer payée hors ligne, solder un remboursement).
- **Pages légales** : mentions légales, conditions de vente, confidentialité et cookies, livraison et retours, contact, à propos ; l'identité du vendeur vient de l'environnement.
- **Accessibilité et SEO** : navigation clavier, lien d'évitement, formulaires étiquetés avec erreurs annoncées, `robots.txt`, `sitemap.xml`, Open Graph.

## Stack

Next.js 16 (App Router, Server Actions), TypeScript strict, Postgres (Neon en production, PGlite en local et en test) avec Drizzle, Zod, CSS écrit à la main (aucun framework), polices auto-hébergées (Fraunces, Bricolage Grotesque, Young Serif, Hanken Grotesk). Tests Vitest sur un **vrai Postgres en mémoire**.

## Démarrer en local

```bash
npm install
npm run dev        # http://localhost:3000
```

Sans `DATABASE_URL`, une base embarquée est créée dans `.pglite/`, migrée et garnie d'un catalogue de démonstration. Pour tester le back-office, créez `.env.local` :

```
ADMIN_EMAIL=vous@exemple.test
```

puis inscrivez-vous avec cette adresse : le compte est administrateur.

Autres commandes : `npm test`, `npm run lint`, `npm run typecheck`, `npm run db:generate` (après un changement de `src/db/schema.ts`).

## Déployer sur Vercel (gratuit)

1. **Base de données** : créez un projet [Neon](https://neon.tech) (offre gratuite) ou ajoutez l'intégration Neon depuis le tableau de bord Vercel, qui renseigne `DATABASE_URL` toute seule.
2. **Projet** : importez le dépôt dans Vercel. `vercel-build` applique les migrations puis construit le site.
3. **Variables d'environnement** (Settings → Environment Variables, voir `.env.example`). Obligatoires en production, sans quoi le build échoue volontairement :
   `DATABASE_URL`, `APP_SECRET` (32 caractères aléatoires), `ADMIN_EMAIL`, `SHOP_LEGAL_NAME`, `SHOP_CONTACT_EMAIL`.
4. Ouvrez le site, inscrivez-vous avec `ADMIN_EMAIL`, puis remplacez le catalogue de démonstration depuis `/admin`.

Le catalogue de démonstration n'est chargé automatiquement qu'en local. Sur une base de production vide, posez `SEED_DEMO_CATALOG=true` pour le charger au premier déploiement, ou lancez `npm run db:seed` avec `DATABASE_URL`, ou créez directement vos rayons et produits dans `/admin`.

## Identité visuelle

`SHOP_THEME` choisit un preset : `papier` (papeterie, livres, artisanat), `atelier` (sombre, cuivre : outillage, mode, design) ou `marche` (verts et terre cuite : alimentation, plantes, bien-être). Chaque preset redéfinit la palette nommée et la police d'affichage dans `src/app/globals.css`. Les produits sans photo reçoivent une vignette typographique teintée (6 teintes) ; une adresse de photo peut être renseignée dans l'administration.

## Devise

`SHOP_CURRENCY` : devise de base (`XOF` par défaut, franc CFA sans décimale ; `EUR` ou `USD` possibles). Les prix du catalogue sont saisis dans cette devise. Les montants sont toujours des entiers en unité mineure (centimes, ou francs pour le XOF) : aucun flottant n'entre dans un calcul d'argent.

**Multi-devises (XOF, USD, EUR)** : dans `/admin/devises`, saisissez un taux (« 1 XOF = combien de USD ? », ex. `0.0016`) et cochez « Proposer … aux visiteurs ». Un sélecteur apparaît alors dans l'en-tête ; le choix est mémorisé par cookie. Le client est facturé dans la devise choisie : les prix unitaires et les frais de port sont convertis à la création de la commande, et la devise est enregistrée sur la commande (paiement, e-mail et back-office l'affichent). Limites : les taux sont saisis à la main (pas de flux de change en direct), une devise sans taux reste inactive, et la conversion est arrondie par prix unitaire.

## Paiement : passer du mode test au réel

- **Mode test (par défaut)** : `PAYMENT_PROVIDERS=demo`. Aucun argent ne circule ; un bandeau l'indique aux visiteurs (`SHOP_DEMO_NOTICE`).
- **Stripe** : `PAYMENT_PROVIDERS=stripe` (ou `demo,stripe`), `STRIPE_SECRET_KEY` (une clé `sk_test_` pour les essais), `STRIPE_WEBHOOK_SECRET`, et déclarez `https://votre-domaine/api/webhooks/stripe` dans Stripe (événement `checkout.session.completed`). Une clé `sk_live_` est refusée tant que `ALLOW_LIVE_PAYMENTS=true` n'est pas posé.
- **Vente réelle** : `SHOP_DEMO_NOTICE=false` interdit le fournisseur `demo`. Vendre suppose un statut qui le permet, des conditions de vente et une fiscalité en règle : relisez les pages légales avec votre situation.
- **FedaPay, KKiaPay, mobile money** : à ajouter en implémentant `PaymentProvider` (`src/payments/types.ts`) : `createPayment` renvoie l'adresse de paiement, `parseWebhook` vérifie la signature et traduit l'événement. Tout le reste (idempotence, contrôle du montant, stock, e-mail) est déjà en place. Ces deux adaptateurs ne sont pas livrés : leur documentation publique ne détaille pas la signature des webhooks, et un code de sécurité ne s'écrit pas de mémoire. Ils s'ajoutent avec une clé sandbox pour les vérifier.
- **Paiement reçu hors ligne** (virement, espèces, mobile money manuel) : bouton « Enregistrer le paiement » sur la commande, dans l'administration.

## E-mails

Sans configuration, la confirmation de commande est écrite dans les journaux. Avec `RESEND_API_KEY` (et `MAIL_FROM` sur un domaine vérifié), elle est envoyée par [Resend](https://resend.com) (offre gratuite).

## Sécurité

- Actions du back-office revérifiées côté serveur (`requireAdmin`), pas seulement masquées.
- Limitation de débit atomique en base (connexion, inscription, commande), par empreinte anonyme : ni adresse IP ni e-mail en clair.
- Redirections de retour limitées aux chemins internes ; commandes consultables sans compte uniquement avec leur jeton secret.
- En-têtes de sécurité, `robots` sans indexation des pages privées.
- Un paiement reçu pour une commande qu'on ne peut plus honorer (expirée dont le stock a été vendu, annulée) est signalé « remboursement à faire » dans le back-office.

Limites connues : sur Vercel, le nettoyage des commandes expirées se fait au fil des visites (pas de tâche planifiée sur l'offre gratuite) ; les tests tournent sur PGlite, mono-connexion, donc la garantie de non-survente en concurrence réelle repose sur la conditionnelle `UPDATE … WHERE stock >= n` de Postgres, non sur un test multi-connexions.

## Licence

MIT.
