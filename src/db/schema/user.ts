import { pgTable, uuid, text, timestamp, integer, boolean, real, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { tenantIsolationPolicy } from "./_rls";

export const userRoleEnum = ["member", "tenant_admin", "platform_admin"] as const;
export type UserRole = (typeof userRoleEnum)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: userRoleEnum }).notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("users_tenant_email_unique").on(table.tenantId, table.email),
    tenantIsolationPolicy("users", table.tenantId),
  ],
).enableRLS();

export const plotSizeEnum = [
  "window_ledge",
  "balcony",
  "small_garden",
  "medium_garden",
  "large_garden",
  "allotment",
] as const;
export type PlotSize = (typeof plotSizeEnum)[number];

export const expertiseLevelEnum = ["beginner", "intermediate", "advanced"] as const;
export type ExpertiseLevel = (typeof expertiseLevelEnum)[number];

// "estimated" = last written by the AI plot-photo estimate (see
// growingAreaEstimator.ts); "manual" = the user typed it in directly (either
// via setPlotBoundaryAction, or by editing the AI's number before confirming
// an estimate — see confirmGrowingAreaProposalsAction, which always writes
// "manual" since the user had final edit control over whatever was
// submitted). Never overwritten with a lower-confidence AI guess once set —
// only used to decide which value pre-fills the estimate review form.
export const plotBoundarySourceEnum = ["estimated", "manual"] as const;
export type PlotBoundarySource = (typeof plotBoundarySourceEnum)[number];

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    postcode: text("postcode"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    plotSize: text("plot_size", { enum: plotSizeEnum }),
    // A separate, more precise concept from plotSize above — that's a
    // coarse onboarding category (window ledge vs. allotment) consumed by
    // the grow planner prompt; these are literal cm dimensions used only by
    // the /garden/layout drag-and-drop canvas. Deliberately not reconciled
    // with plotSize or fed into the grow planner — a real future
    // enhancement, out of scope for now. Null until the user either
    // confirms an AI plot-photo estimate or sets one manually.
    plotWidthCm: real("plot_width_cm"),
    plotLengthCm: real("plot_length_cm"),
    plotBoundarySource: text("plot_boundary_source", { enum: plotBoundarySourceEnum }),
    avgSunlightHours: real("avg_sunlight_hours"),
    householdSize: integer("household_size"),
    expertiseLevel: text("expertise_level", { enum: expertiseLevelEnum }),
    hasIndoorSeedlingSpace: boolean("has_indoor_seedling_space"),
    weekdayHoursAvailable: real("weekday_hours_available"),
    weekendHoursAvailable: real("weekend_hours_available"),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    // Tracks the once-a-calendar-month cadence for generateMaintenanceTasksFn
    // — null means "never run." Checked against startOfMonthLocal() by
    // dailyJobsFn's own eligibility query, not by this table itself.
    lastMaintenanceTasksGeneratedAt: timestamp("last_maintenance_tasks_generated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("user_profiles", table.tenantId)],
).enableRLS();
