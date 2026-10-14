-- Sécurité : une ligne de panier sans déclinaison (cas théorique) est retirée avant de rendre la colonne obligatoire.
DELETE FROM "cart_items" WHERE "variant_id" IS NULL;--> statement-breakpoint
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_cart_id_product_id_pk";--> statement-breakpoint
ALTER TABLE "cart_items" ALTER COLUMN "variant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_variant_id_pk" PRIMARY KEY("cart_id","variant_id");--> statement-breakpoint
ALTER TABLE "cart_items" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "stock";