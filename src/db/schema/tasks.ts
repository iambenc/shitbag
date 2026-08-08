import { pgTable, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { crops } from "./crop";
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
    status: text("status", { enum: taskStatusEnum }).notNull().default("pending"),
    source: text("source", { enum: taskSourceEnum }).notNull().default("manual"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("tasks", table.tenantId)],
).enableRLS();
