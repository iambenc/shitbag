CREATE TABLE "crop_varieties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"crop_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"days_to_harvest_min" integer,
	"days_to_harvest_max" integer,
	"spacing_cm" integer,
	"growth_habit" text,
	"disease_resistance_notes" text,
	"characteristics" text,
	"estimated_retail_price_per_kg_gbp" real,
	"verified" boolean DEFAULT true NOT NULL,
	"source_provider" text,
	"source_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crop_varieties_crop_slug_unique" UNIQUE("crop_id","slug")
);
--> statement-breakpoint
ALTER TABLE "seed_inventory" ADD COLUMN "variety_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "variety_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "seed_deduction_variety_id" uuid;--> statement-breakpoint
ALTER TABLE "harvest_log" ADD COLUMN "variety_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_recommendations" ADD COLUMN "variety_id" uuid;--> statement-breakpoint
ALTER TABLE "crop_varieties" ADD CONSTRAINT "crop_varieties_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_inventory" ADD CONSTRAINT "seed_inventory_variety_id_crop_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."crop_varieties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_variety_id_crop_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."crop_varieties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_seed_deduction_variety_id_crop_varieties_id_fk" FOREIGN KEY ("seed_deduction_variety_id") REFERENCES "public"."crop_varieties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_log" ADD CONSTRAINT "harvest_log_variety_id_crop_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."crop_varieties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_recommendations" ADD CONSTRAINT "plan_recommendations_variety_id_crop_varieties_id_fk" FOREIGN KEY ("variety_id") REFERENCES "public"."crop_varieties"("id") ON DELETE set null ON UPDATE no action;