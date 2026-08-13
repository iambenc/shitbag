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
