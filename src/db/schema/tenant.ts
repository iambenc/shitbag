import { pgTable, uuid, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { tenantIsolationPolicy } from "./_rls";

// `tenants` itself is intentionally NOT row-level-secured — resolving which
// tenant a request belongs to (by slug/domain) has to happen before we know
// a tenant_id to scope by. Every table below that HAS a tenant_id is secured.
export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  customDomain: text("custom_domain").unique(),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").notNull().default("#2f6b3c"),
  secondaryColor: text("secondary_color").notNull().default("#e8c34a"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tenantPlans = pgTable(
  "tenant_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    stripePriceId: text("stripe_price_id"),
    monthlyAmountPence: integer("monthly_amount_pence").notNull().default(500),
    currency: text("currency").notNull().default("gbp"),
    trialDays: integer("trial_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("tenant_plans", table.tenantId)],
).enableRLS();

export const tenantAIConfigs = pgTable(
  "tenant_ai_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    agent: text("agent", { enum: ["grow_planner", "plant_health"] }).notNull(),
    provider: text("provider").notNull().default("google"),
    model: text("model").notNull().default("gemini-3.5-flash"),
    apiKeyEncrypted: text("api_key_encrypted"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("tenant_ai_configs", table.tenantId)],
).enableRLS();
