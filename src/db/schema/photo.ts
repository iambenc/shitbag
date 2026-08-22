import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { growingAreas } from "./growing-area";
import { harvestLog } from "./harvest";
import { tenantIsolationPolicy } from "./_rls";

export const photoVisibilityEnum = ["private", "shared_tenant"] as const;
export type PhotoVisibility = (typeof photoVisibilityEnum)[number];

export const photoJournalEntries = pgTable(
  "photo_journal_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    url: text("url").notNull(),
    caption: text("caption"),
    // Optionally tags this photo as "of" a specific growing area — set
    // either by the weekly garden-health-check flow
    // (generateHealthCheckTasks.ts / uploadAndDiagnoseAction) or directly by
    // a user via the /journal upload form's own area picker
    // (uploadPhotoAction). Lets a plantDiagnoses row (joined via
    // photoJournalEntryId) be attributed back to a specific growing area for
    // the dashboard's Garden Health donut, without adding a redundant
    // duplicate column on plantDiagnoses itself.
    growingAreaId: uuid("growing_area_id").references(() => growingAreas.id, { onDelete: "set null" }),
    // Optionally tags this photo as "of" a specific harvest — set only at
    // harvest-log time (addHarvestAction), mirroring growingAreaId's shape
    // exactly. A photo can have neither, either, or in principle both tags.
    harvestLogId: uuid("harvest_log_id").references(() => harvestLog.id, { onDelete: "set null" }),
    visibility: text("visibility", { enum: photoVisibilityEnum }).notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("photo_journal_entries", table.tenantId)],
).enableRLS();
