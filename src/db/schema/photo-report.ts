import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { photoJournalEntries } from "./photo";
import { tenantIsolationPolicy } from "./_rls";

// Storage only, same as taskRescheduleEvents (Phase 6) — no UI reads this
// table yet. Reviewing reports is Phase 8's tenant-admin tooling; this phase
// just gives users the "report" button and somewhere for it to go.
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("photo_reports", table.tenantId)],
).enableRLS();
