import { pgTable, uuid, text, boolean, integer, date, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { crops, cropVarieties } from "./crop";
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
    // Inherited from this task's owning recommendation/replacement decision
    // at persist time (see generateGrowPlan.ts/regenerateRecommendation.ts)
    // — never asked of the AI per-task, since a recommendation's variety
    // choice already applies uniformly to every task it produces, same as
    // cropId already does. Read by toggleTaskCompleteAction to prefer
    // deducting from variety-matched seedInventory stock.
    varietyId: uuid("variety_id").references(() => cropVarieties.id, { onDelete: "set null" }),
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
    // Set only on a task that sows/plants seeds (the original sow, and any
    // succession re-sow) — the AI's estimate of how many seeds that specific
    // sowing needs, based on the growing area's size and the crop's
    // spacingCm. Null for every other task (feeding, transplanting). Read
    // by toggleTaskCompleteAction to deduct from the user's seedInventory
    // once this task is actually completed, not at generation time — a
    // generated-but-never-done task shouldn't consume anything.
    estimatedSeedsUsed: integer("estimated_seeds_used"),
    // True only while a real seed deduction is currently applied for this
    // task (set on completion iff matching stock existed, cleared on
    // un-completion or once restored). Needed as its own flag, distinct from
    // seedDeductionVarietyId below, because that column's null is
    // ambiguous on its own — it means EITHER "deducted from the
    // variety-agnostic bucket" OR "no deduction ever fired" (e.g. the crop
    // had zero numeric seedInventory rows at completion time), and
    // restoration must never treat the second case as the first (crediting
    // seeds that were never actually taken).
    seedDeductionApplied: boolean("seed_deduction_applied").notNull().default(false),
    // Meaningful only while seedDeductionApplied is true — records which
    // bucket actually got debited: this task's own varietyId if
    // variety-matched stock existed at completion time, or null if it fell
    // back to variety-agnostic stock. Un-completing must credit this exact
    // bucket back, not re-decide the variety-vs-agnostic preference fresh —
    // new stock added between complete/un-complete must never silently
    // redirect the restored seeds to a different bucket than the one
    // actually debited.
    seedDeductionVarietyId: uuid("seed_deduction_variety_id").references(() => cropVarieties.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: taskStatusEnum }).notNull().default("pending"),
    source: text("source", { enum: taskSourceEnum }).notNull().default("manual"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("tasks", table.tenantId)],
).enableRLS();
