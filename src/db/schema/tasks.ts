import { pgTable, uuid, text, boolean, date, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { crops } from "./crop";
import { planRecommendationStages, planRecommendations } from "./grow-plan";
import { tenantIsolationPolicy } from "./_rls";

export const taskStatusEnum = ["pending", "completed", "missed"] as const;
export type TaskStatus = (typeof taskStatusEnum)[number];

export const taskSourceEnum = ["manual", "ai", "weather"] as const;
export type TaskSource = (typeof taskSourceEnum)[number];

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    // String mode: we only ever care about the calendar date, not a timezone-attached instant.
    dueDate: date("due_date", { mode: "string" }).notNull(),
    // The spec's "absolute last date for the task".
    hardDeadlineDate: date("hard_deadline_date", { mode: "string" }),
    // Nullable: only set for tasks generated from a grow-plan recommendation
    // (or a weather rule) — lets the weekly shopping-list job find "the sow
    // task for this crop" without a separate task<->recommendation table.
    cropId: uuid("crop_id").references(() => crops.id, { onDelete: "set null" }),
    // Which specific recommendation this task belongs to — nullable (manual/
    // weather tasks have none). Unlike cropId, this is unambiguous even when
    // two recommendations in the same plan share a crop (the grouping
    // scenario), which is exactly why rejecting one recommendation needs
    // this to clean up only its own tasks. See regenerateRecommendation.ts.
    planRecommendationId: uuid("plan_recommendation_id").references(() => planRecommendations.id, {
      onDelete: "set null",
    }),
    // Set only on a transplant task — completing it releases the preceding
    // stage's growing area (back to available) and claims this stage's area
    // (to in_use). Null for every other task. See toggleTaskCompleteAction.
    activatesStageId: uuid("activates_stage_id").references(() => planRecommendationStages.id, {
      onDelete: "set null",
    }),
    // True for a task that sows/plants something indoors (e.g. a seed tray)
    // ahead of its outdoor season. AI-authored, same as the rest of a task's
    // scheduling details — false (the default) for manual/weather tasks and
    // every non-planting AI task (feeding, succession, transplanting out).
    isIndoor: boolean("is_indoor").notNull().default(false),
    // Groups a succession-sowing crop's batch of re-sow tasks (e.g. "sow
    // lettuce every ~2-3 weeks") together — nullable, no FK, a pure
    // app-generated grouping key (randomUUID()) rather than a reference to
    // another table. Only ever set across several tasks inserted together in
    // one plan-generation/replacement run; never retroactively assigned.
    // Lets "cancel remaining re-sows" target exactly this crop's batch
    // without touching an unrelated recommendation of the same crop.
    successionSeriesId: uuid("succession_series_id"),
    status: text("status", { enum: taskStatusEnum }).notNull().default("pending"),
    source: text("source", { enum: taskSourceEnum }).notNull().default("manual"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("tasks", table.tenantId)],
).enableRLS();
