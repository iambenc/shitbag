import { pgTable, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { tenantIsolationPolicy } from "./_rls";

export const taskStatusEnum = ["pending", "completed"] as const;
export type TaskStatus = (typeof taskStatusEnum)[number];

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
    status: text("status", { enum: taskStatusEnum }).notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("tasks", table.tenantId)],
).enableRLS();
