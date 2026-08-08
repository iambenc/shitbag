CREATE TABLE "grow_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text,
	"model" text,
	"raw_output" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "grow_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "plan_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"grow_plan_id" uuid NOT NULL,
	"crop_id" uuid NOT NULL,
	"reasoning" text NOT NULL,
	"requires_purchase" boolean DEFAULT false NOT NULL,
	"estimated_harvest_start" date,
	"estimated_harvest_end" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_recommendations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "hard_deadline_date" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "grow_plans" ADD CONSTRAINT "grow_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grow_plans" ADD CONSTRAINT "grow_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_recommendations" ADD CONSTRAINT "plan_recommendations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_recommendations" ADD CONSTRAINT "plan_recommendations_grow_plan_id_grow_plans_id_fk" FOREIGN KEY ("grow_plan_id") REFERENCES "public"."grow_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_recommendations" ADD CONSTRAINT "plan_recommendations_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "grow_plans_tenant_isolation" ON "grow_plans" AS PERMISSIVE FOR ALL TO public USING ("grow_plans"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("grow_plans"."tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "plan_recommendations_tenant_isolation" ON "plan_recommendations" AS PERMISSIVE FOR ALL TO public USING ("plan_recommendations"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("plan_recommendations"."tenant_id" = current_setting('app.tenant_id', true)::uuid);