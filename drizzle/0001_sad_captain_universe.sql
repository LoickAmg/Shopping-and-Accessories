CREATE TABLE "currencies" (
	"code" text PRIMARY KEY NOT NULL,
	"exponent" integer NOT NULL,
	"rate_micros" bigint NOT NULL,
	"is_base" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
