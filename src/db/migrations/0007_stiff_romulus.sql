CREATE TABLE "plant_diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"photo_journal_entry_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text,
	"model" text,
	"issue" text,
	"severity" text,
	"confidence" real,
	"raw_output" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "plant_diagnoses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "photo_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"photo_journal_entry_id" uuid NOT NULL,
	"reported_by_user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "photo_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plant_diagnoses" ADD CONSTRAINT "plant_diagnoses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_diagnoses" ADD CONSTRAINT "plant_diagnoses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_diagnoses" ADD CONSTRAINT "plant_diagnoses_photo_journal_entry_id_photo_journal_entries_id_fk" FOREIGN KEY ("photo_journal_entry_id") REFERENCES "public"."photo_journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_reports" ADD CONSTRAINT "photo_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_reports" ADD CONSTRAINT "photo_reports_photo_journal_entry_id_photo_journal_entries_id_fk" FOREIGN KEY ("photo_journal_entry_id") REFERENCES "public"."photo_journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_reports" ADD CONSTRAINT "photo_reports_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "plant_diagnoses_tenant_isolation" ON "plant_diagnoses" AS PERMISSIVE FOR ALL TO public USING ("plant_diagnoses"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("plant_diagnoses"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "photo_reports_tenant_isolation" ON "photo_reports" AS PERMISSIVE FOR ALL TO public USING ("photo_reports"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("photo_reports"."tenant_id" = current_setting('app.tenant_id', true)::uuid);