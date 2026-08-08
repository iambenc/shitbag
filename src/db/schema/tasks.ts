import { pgTable, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { tenantIsolationPolicy } from "./_rls";

export const taskStatusEnum = ["pending", "completed"] as const;
export type TaskStatus = (typeof taskStatusEnum)[number];

export const taskSourceEnum = ["manual", "ai"] as const;
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
    // The spec's "absolute last date for the task" — stored/displayed only for
    // now; automatic push-back of missed tasks is a Phase 6 background job.
    hardDeadlineDate: date("hard_deadline_date", { mode: "string" }),
    status: text("status", { enum: taskStatusEnum }).notNull().default("pending"),
    source: text("source", { enum: taskSourceEnum }).notNull().default("manual"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("tasks", table.tenantId)],
).enableRLS();
