ALTER TABLE "photo_reports" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "photo_reports" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photo_reports" ADD COLUMN "resolved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "photo_reports" ADD CONSTRAINT "photo_reports_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_ai_configs" ADD CONSTRAINT "tenant_ai_configs_tenant_agent_unique" UNIQUE("tenant_id","agent");--> statement-breakpoint
ALTER TABLE "tenant_plans" ADD CONSTRAINT "tenant_plans_tenant_unique" UNIQUE("tenant_id");