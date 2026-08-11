CREATE TABLE "growing_area_estimations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"photo_storage_keys" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text,
	"model" text,
	"raw_output" jsonb,
	"error_message" text,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "growing_area_estimations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "growing_area_estimations" ADD CONSTRAINT "growing_area_estimations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growing_area_estimations" ADD CONSTRAINT "growing_area_estimations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "growing_area_estimations_tenant_isolation" ON "growing_area_estimations" AS PERMISSIVE FOR ALL TO public USING ("growing_area_estimations"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("growing_area_estimations"."tenant_id" = current_setting('app.tenant_id', true)::uuid);