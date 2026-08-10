ALTER TABLE "crops" ADD COLUMN "verified" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "crops" ADD COLUMN "source_provider" text;--> statement-breakpoint
ALTER TABLE "crops" ADD COLUMN "source_model" text;