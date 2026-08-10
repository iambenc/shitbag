ALTER TABLE "tasks" ADD COLUMN "plan_recommendation_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_recommendations" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_plan_recommendation_id_plan_recommendations_id_fk" FOREIGN KEY ("plan_recommendation_id") REFERENCES "public"."plan_recommendations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- One-time backfill, not a default change: every recommendation that exists
-- before this migration already has committed real-world effects (tasks
-- scheduled, growing areas claimed) — from the user's perspective it was
-- implicitly already accepted, so it shouldn't suddenly render as
-- "unreviewed" with Accept/Reject buttons. New rows still default to
-- 'pending' via the column default above.
UPDATE "plan_recommendations" SET "status" = 'accepted';