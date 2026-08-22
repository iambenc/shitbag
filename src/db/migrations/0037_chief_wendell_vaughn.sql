CREATE TABLE "garden_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"growing_area_id" uuid,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "garden_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "garden_notes" ADD CONSTRAINT "garden_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_notes" ADD CONSTRAINT "garden_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garden_notes" ADD CONSTRAINT "garden_notes_growing_area_id_growing_areas_id_fk" FOREIGN KEY ("growing_area_id") REFERENCES "public"."growing_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "garden_notes_tenant_isolation" ON "garden_notes" AS PERMISSIVE FOR ALL TO public USING ("garden_notes"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("garden_notes"."tenant_id" = current_setting('app.tenant_id', true)::uuid);