CREATE TABLE "product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"size" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '' NOT NULL,
	"sku" text,
	"stock" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "product_variants_stock_non_negative" CHECK ("product_variants"."stock" >= 0)
);
--> statement-breakpoint
ALTER TABLE "products" DROP CONSTRAINT "products_stock_non_negative";--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "variant_id" integer;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "family" text DEFAULT 'sacs' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "department" text DEFAULT 'femme' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "condition" text DEFAULT 'neuf' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "wear_grade" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "defects" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "material" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "gallery" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_variants_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_unique" ON "product_variants" USING btree ("product_id","size","color");--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_department_idx" ON "products" USING btree ("department");--> statement-breakpoint
CREATE INDEX "products_condition_idx" ON "products" USING btree ("condition");--> statement-breakpoint
-- Reprise des données : chaque produit existant devient une déclinaison unique (sans taille ni couleur) qui garde son stock.
INSERT INTO "product_variants" ("product_id", "size", "color", "stock", "position") SELECT "id", '', '', "stock", 0 FROM "products";--> statement-breakpoint
-- Les paniers et les commandes existants pointent vers cette déclinaison.
UPDATE "cart_items" AS ci SET "variant_id" = v."id" FROM "product_variants" AS v WHERE v."product_id" = ci."product_id";--> statement-breakpoint
UPDATE "order_items" AS oi SET "variant_id" = v."id" FROM "product_variants" AS v WHERE v."product_id" = oi."product_id";
