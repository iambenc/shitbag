import { pgTable, uuid, text, boolean, integer, date, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { crops } from "./crop";
import { growingAreas } from "./growing-area";
import { tenantIsolationPolicy } from "./_rls";

export const growPlanStatusEnum = ["pending", "complete", "failed"] as const;
export type GrowPlanStatus = (typeof growPlanStatusEnum)[number];

export const growPlans = pgTable(
  "grow_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: growPlanStatusEnum }).notNull().default("pending"),
    provider: text("provider"),
    model: text("model"),
    // The full structured response, kept for audit/debug — not read by the UI directly.
    rawOutput: jsonb("raw_output"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [tenantIsolationPolicy("grow_plans", table.tenantId)],
).enableRLS();

// pending = awaiting the user's review; accepted = explicitly kept; rejected
// = superseded by a replacement, kept as history, never deleted; regenerating
// = a reject is in flight (set the instant it's requested, before any AI
// call, so the UI can show a placeholder immediately). See
// regenerateRecommendation.ts for the pending/accepted -> regenerating ->
// rejected (+ a fresh pending replacement) lifecycle.
export const planRecommendationStatusEnum = ["pending", "accepted", "regenerating", "rejected"] as const;
export type PlanRecommendationStatus = (typeof planRecommendationStatusEnum)[number];

export const planRecommendations = pgTable(
  "plan_recommendations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    growPlanId: uuid("grow_plan_id")
      .notNull()
      .references(() => growPlans.id, { onDelete: "cascade" }),
    cropId: uuid("crop_id")
      .notNull()
      .references(() => crops.id, { onDelete: "cascade" }),
    reasoning: text("reasoning").notNull(),
    requiresPurchase: boolean("requires_purchase").notNull().default(false),
    estimatedHarvestStart: date("estimated_harvest_start", { mode: "string" }),
    estimatedHarvestEnd: date("estimated_harvest_end", { mode: "string" }),
    status: text("status", { enum: planRecommendationStatusEnum }).notNull().default("pending"),
    // Depth of the replacement chain that produced this row — 0 for a fresh
    // recommendation from a full plan generation, oldRow.regenerationCount + 1
    // for a reject's replacement. Not "times this row itself was rejected"
    // (a row is rejected at most once before being replaced). Caps how many
    // more times this lineage may still be rejected (see rejectRecommendationAction).
    regenerationCount: integer("regeneration_count").notNull().default(0),
    // True only for the one deliberately unusual/uncommon-but-UK-growable
    // crop the planner adds when the user ticks "try something new" at
    // generation time — false (the correct value for every pre-existing
    // row too, hence the default) for every ordinary recommendation.
    isUnusualSuggestion: boolean("is_unusual_suggestion").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("plan_recommendations", table.tenantId)],
).enableRLS();

export const planRecommendationStageStatusEnum = ["upcoming", "active", "done"] as const;
export type PlanRecommendationStageStatus = (typeof planRecommendationStageStatusEnum)[number];

// A recommendation's full lifecycle across growing areas — most crops have
// exactly one row (stageIndex 0, sown directly in its final spot), some have
// 2-3 (e.g. seed tray -> pot -> final bed). Which specific growing area each
// stage fills, replacing the single growingAreaId planRecommendations used to
// carry directly: a "current stage" pointer would need to stay in sync across
// four separate write paths (persist, task-completion forward/reverse, plan
// regeneration) for no real benefit over always going through this table.
export const planRecommendationStages = pgTable(
  "plan_recommendation_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planRecommendationId: uuid("plan_recommendation_id")
      .notNull()
      .references(() => planRecommendations.id, { onDelete: "cascade" }),
    stageIndex: integer("stage_index").notNull(),
    // Nullable: set null if the underlying growing area is later deleted
    // (unreachable via today's UI — syncGrowingAreasAction only ever deletes
    // "available" rows, never reserved/in_use — but defensive regardless,
    // same as every other growingAreas FK in this schema).
    growingAreaId: uuid("growing_area_id").references(() => growingAreas.id, { onDelete: "set null" }),
    status: text("status", { enum: planRecommendationStageStatusEnum }).notNull().default("upcoming"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("plan_recommendation_stages_rec_index_unique").on(table.planRecommendationId, table.stageIndex),
    tenantIsolationPolicy("plan_recommendation_stages", table.tenantId),
  ],
).enableRLS();
