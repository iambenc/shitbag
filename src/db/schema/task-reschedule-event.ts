import { pgTable, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { tasks } from "./tasks";
import { tenantIsolationPolicy } from "./_rls";

export const taskRescheduleReasonEnum = ["slipped", "weather"] as const;
export type TaskRescheduleReason = (typeof taskRescheduleReasonEnum)[number];

// Audit trail only — nothing in the spec asks users to see reschedule
// history, so there's no UI reading this table, just storage for
// correctness/debuggability of the daily slippage job.
export const taskRescheduleEvents = pgTable(
  "task_reschedule_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    oldDueDate: date("old_due_date", { mode: "string" }).notNull(),
    newDueDate: date("new_due_date", { mode: "string" }).notNull(),
    reason: text("reason", { enum: taskRescheduleReasonEnum }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("task_reschedule_events", table.tenantId)],
).enableRLS();
