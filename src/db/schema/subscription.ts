import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { tenantIsolationPolicy } from "./_rls";

export const subscriptionTierEnum = ["free", "paid"] as const;
export type SubscriptionTier = (typeof subscriptionTierEnum)[number];

// Only meaningful once tier is "paid" — a free user's status is null.
export const subscriptionStatusEnum = ["active", "past_due", "canceled"] as const;
export type SubscriptionStatus = (typeof subscriptionStatusEnum)[number];

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: text("tier", { enum: subscriptionTierEnum }).notNull().default("free"),
    status: text("status", { enum: subscriptionStatusEnum }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("subscriptions", table.tenantId)],
).enableRLS();
