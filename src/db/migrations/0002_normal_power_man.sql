CREATE TABLE "growing_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"size_label" text,
	"width_cm" real,
	"length_cm" real,
	"depth_cm" real,
	"status" text DEFAULT 'available' NOT NULL,
	"source_user_equipment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "growing_areas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "growing_areas" ADD CONSTRAINT "growing_areas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growing_areas" ADD CONSTRAINT "growing_areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growing_areas" ADD CONSTRAINT "growing_areas_source_user_equipment_id_user_equipment_id_fk" FOREIGN KEY ("source_user_equipment_id") REFERENCES "public"."user_equipment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "growing_areas_tenant_isolation" ON "growing_areas" AS PERMISSIVE FOR ALL TO public USING ("growing_areas"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("growing_areas"."tenant_id" = current_setting('app.tenant_id', true)::uuid);