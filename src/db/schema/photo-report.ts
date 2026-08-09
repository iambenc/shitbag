import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { photoJournalEntries } from "./photo";
import { tenantIsolationPolicy } from "./_rls";

export const photoReportStatusEnum = ["pending", "dismissed", "actioned"] as const;
export type PhotoReportStatus = (typeof photoReportStatusEnum)[number];

// Reviewed by Phase 8's tenant-admin queue (`/admin/reports`): "dismissed"
// means no violation found, "actioned" means the photo was unshared —
// distinct outcomes worth keeping separate in the admin's history.
export const photoReports = pgTable(
  "photo_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    photoJournalEntryId: uuid("photo_journal_entry_id")
      .notNull()
      .references(() => photoJournalEntries.id, { onDelete: "cascade" }),
    reportedByUserId: uuid("reported_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    status: text("status", { enum: photoReportStatusEnum }).notNull().default("pending"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    // Audit pointer, not ownership — deliberately "set null" (not cascade) so
    // deleting an admin's account later doesn't erase the record of what they
    // resolved, same reasoning as taskRescheduleEvents.
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("photo_reports", table.tenantId)],
).enableRLS();
