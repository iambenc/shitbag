CREATE TABLE "task_reschedule_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"old_due_date" date NOT NULL,
	"new_due_date" date NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_reschedule_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "crop_id" uuid;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_reschedule_events" ADD CONSTRAINT "task_reschedule_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_reschedule_events" ADD CONSTRAINT "task_reschedule_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "task_reschedule_events_tenant_isolation" ON "task_reschedule_events" AS PERMISSIVE FOR ALL TO public USING ("task_reschedule_events"."tenant_id" = current_setting('app.tenant_id', true)::uuid) WITH CHECK ("task_reschedule_events"."tenant_id" = current_setting('app.tenant_id', true)::uuid);