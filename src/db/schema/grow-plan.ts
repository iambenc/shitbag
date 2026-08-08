import { pgTable, uuid, text, boolean, date, jsonb, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { crops } from "./crop";
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("plan_recommendations", table.tenantId)],
).enableRLS();
