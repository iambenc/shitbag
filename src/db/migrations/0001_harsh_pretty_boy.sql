CREATE TABLE "crops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"emoji" text NOT NULL,
	"spacing_cm" integer NOT NULL,
	"soil_depth_cm" integer NOT NULL,
	"sow_indoor_from_month" integer,
	"sow_indoor_to_month" integer,
	"sow_outdoor_from_month" integer,
	"sow_outdoor_to_month" integer,
	"days_to_harvest_min" integer NOT NULL,
	"days_to_harvest_max" integer NOT NULL,
	"supports_succession_sowing" boolean DEFAULT false NOT NULL,
	"feeding_notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "crops_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "seed_inventory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"crop_id" uuid NOT NULL,
	"quantity_label" text NOT NULL,
	"source" text DEFAULT 'onboarding' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seed_inventory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_favorite_crops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"crop_id" uuid NOT NULL,
	"liked" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_favorite_crops_user_crop_unique" UNIQUE("user_id","crop_id")
);
--> statement-breakpoint
ALTER TABLE "user_favorite_crops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "equipment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "equipment_types_tenant_slug_unique" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
ALTER TABLE "equipment_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "partner_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"equipment_type_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"equipment_type_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"size_label" text,
	"width_cm" real,
	"length_cm" real,
	"depth_cm" real
);
--> statement-breakpoint
ALTER TABLE "user_equipment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seed_inventory" ADD CONSTRAINT "seed_inventory_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_inventory" ADD CONSTRAINT "seed_inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_inventory" ADD CONSTRAINT "seed_inventory_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_crops" ADD CONSTRAINT "user_favorite_crops_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_crops" ADD CONSTRAINT "user_favorite_crops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_favorite_crops" ADD CONSTRAINT "user_favorite_crops_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_types" ADD CONSTRAINT "equipment_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_links" ADD CONSTRAINT "partner_links_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_equipment" ADD CONSTRAINT "user_equipment_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_equipment" ADD CONSTRAINT "user_equipment_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_equipment" ADD CONSTRAINT "user_equipment_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "seed_inventory_tenant_isolation" ON "seed_inventory" AS PERMISSIVE FOR ALL TO public USING ("seed_inventory"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("seed_inventory"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "user_favorite_crops_tenant_isolation" ON "user_favorite_crops" AS PERMISSIVE FOR ALL TO public USING ("user_favorite_crops"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("user_favorite_crops"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "equipment_types_tenant_isolation" ON "equipment_types" AS PERMISSIVE FOR ALL TO public USING ("equipment_types"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("equipment_types"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "partner_links_tenant_isolation" ON "partner_links" AS PERMISSIVE FOR ALL TO public USING ("partner_links"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("partner_links"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "user_equipment_tenant_isolation" ON "user_equipment" AS PERMISSIVE FOR ALL TO public USING ("user_equipment"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("user_equipment"."tenant_id" = current_setting('app.tenant_id', true)::uuid);