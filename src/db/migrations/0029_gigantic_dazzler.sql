CREATE TABLE "seed_packet_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seed_packet_scans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seed_packet_scans" ADD CONSTRAINT "seed_packet_scans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_packet_scans" ADD CONSTRAINT "seed_packet_scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "seed_packet_scans_tenant_isolation" ON "seed_packet_scans" AS PERMISSIVE FOR ALL TO public USING ("seed_packet_scans"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("seed_packet_scans"."tenant_id" = current_setting('app.tenant_id', true)::uuid);