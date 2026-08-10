CREATE TABLE "plan_recommendation_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_recommendation_id" uuid NOT NULL,
	"stage_index" integer NOT NULL,
	"growing_area_id" uuid,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_recommendation_stages_rec_index_unique" UNIQUE("plan_recommendation_id","stage_index")
);
--> statement-breakpoint
ALTER TABLE "plan_recommendation_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_recommendations" DROP CONSTRAINT "plan_recommendations_growing_area_id_growing_areas_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "activates_stage_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_recommendation_stages" ADD CONSTRAINT "plan_recommendation_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_recommendation_stages" ADD CONSTRAINT "plan_recommendation_stages_plan_recommendation_id_plan_recommendations_id_fk" FOREIGN KEY ("plan_recommendation_id") REFERENCES "public"."plan_recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_recommendation_stages" ADD CONSTRAINT "plan_recommendation_stages_growing_area_id_growing_areas_id_fk" FOREIGN KEY ("growing_area_id") REFERENCES "public"."growing_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_activates_stage_id_plan_recommendation_stages_id_fk" FOREIGN KEY ("activates_stage_id") REFERENCES "public"."plan_recommendation_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_recommendations" DROP COLUMN "growing_area_id";--> statement-breakpoint
CREATE POLICY "plan_recommendation_stages_tenant_isolation" ON "plan_recommendation_stages" AS PERMISSIVE FOR ALL TO public USING ("plan_recommendation_stages"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("plan_recommendation_stages"."tenant_id" = current_setting('app.tenant_id', true)::uuid);