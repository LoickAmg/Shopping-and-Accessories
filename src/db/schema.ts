import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Tous les montants sont des entiers en unité mineure de la devise (centimes
 * pour l'euro, francs pour le XOF qui n'a pas de subdivision). Aucun flottant
 * n'entre jamais dans un calcul d'argent.
 */

export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    description: text("description").notNull().default(""),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    priceCents: integer("price_cents").notNull(),
    compareAtCents: integer("compare_at_cents"),
    stock: integer("stock").notNull().default(0),
    active: boolean("active").notNull().default(true),
    /** Teinte de la vignette typographique (t1 à t6), tant qu'aucune photo n'est fournie. */
    tone: text("tone").notNull().default("t1"),
    imageUrl: text("image_url"),
    sku: text("sku"),
    /** Nom, résumé et description sans accents ni majuscules : la recherche compare avec cette colonne. */
    searchText: text("search_text").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("products_stock_non_negative", sql`${table.stock} >= 0`),
    check("products_price_positive", sql`${table.priceCents} >= 0`),
    index("products_category_idx").on(table.categoryId),
    index("products_active_idx").on(table.active),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default(""),
    role: text("role", { enum: ["customer", "admin"] }).notNull().default("customer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

/** L'identifiant stocké est l'empreinte SHA-256 du jeton du cookie : une fuite de la base ne donne aucune session. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cartItems = pgTable(
  "cart_items",
  {
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.cartId, table.productId] }),
    check("cart_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const ORDER_STATUSES = ["pending", "paid", "fulfilled", "cancelled", "expired", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Numéro lisible, unique et croissant (affiché au client). */
    number: serial("number").notNull().unique(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    customerName: text("customer_name").notNull(),
    shippingAddress: jsonb("shipping_address").$type<ShippingAddress>().notNull(),
    status: text("status", { enum: ORDER_STATUSES }).notNull().default("pending"),
    currency: text("currency").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    paymentProvider: text("payment_provider").notNull(),
    paymentReference: text("payment_reference"),
    /** Jeton opaque qui permet de consulter la commande sans compte. */
    accessToken: text("access_token").notNull(),
    /** Au-delà, une commande impayée est annulée et son stock restitué. */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("orders_user_idx").on(table.userId),
    index("orders_status_idx").on(table.status),
    uniqueIndex("orders_payment_ref_unique").on(table.paymentProvider, table.paymentReference),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, { onDelete: "set null" }),
    /** Copie du nom et du prix au moment de l'achat : une commande ne change pas quand le catalogue change. */
    name: text("name").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => [index("order_items_order_idx").on(table.orderId)],
);

/** Un événement de paiement (webhook) n'est traité qu'une fois : la clé unique fait office d'idempotence. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("payment_events_unique").on(table.provider, table.eventId)],
);

/**
 * Compteurs de limitation de débit, partagés par toutes les instances (sur un
 * hébergement serverless, un compteur en mémoire serait propre à chacune). La
 * clé est une empreinte, jamais une adresse e-mail ou IP en clair.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

/**
 * Devises acceptées par la boutique. Le catalogue (`products.priceCents`) est
 * toujours exprimé dans la devise de base (`SHOP_CURRENCY`, taux 1). Les
 * autres devises convertissent l'affichage et la commande via `rateMicros`
 * (taux, à l'échelle 1 000 000, pour rester un entier : 1 unité de base =
 * `rateMicros / 1 000 000` unités de cette devise). Éditable depuis
 * l'administration, sans redéploiement.
 */
export const currencies = pgTable("currencies", {
  code: text("code").primaryKey(),
  exponent: integer("exponent").notNull(),
  rateMicros: bigint("rate_micros", { mode: "number" }).notNull(),
  isBase: boolean("is_base").notNull().default(false),
  active: boolean("active").notNull().default(false),
  position: integer("position").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Currency = typeof currencies.$inferSelect;

export interface ShippingAddress {
  line1: string;
  line2?: string;
  postalCode: string;
  city: string;
  country: string;
  phone?: string;
}

export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type User = typeof users.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
