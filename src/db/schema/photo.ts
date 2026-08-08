import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
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
    visibility: text("visibility", { enum: photoVisibilityEnum }).notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("photo_journal_entries", table.tenantId)],
).enableRLS();
