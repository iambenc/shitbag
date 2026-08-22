import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { growingAreas } from "./growing-area";
import { photoVisibilityEnum } from "./photo";
import { tenantIsolationPolicy } from "./_rls";

// A short freeform note about the garden, distinct from photoJournalEntries
// (always requires a photo) and harvestLog.notes (always tied to a specific
// harvest) — this is the only "just text" journal entry. Same optional
// growing-area tag and Private/Shared-with-tenant visibility as photos, for
// consistency, reusing photoVisibilityEnum rather than a duplicate enum.
export const gardenNotes = pgTable(
  "garden_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    growingAreaId: uuid("growing_area_id").references(() => growingAreas.id, { onDelete: "set null" }),
    visibility: text("visibility", { enum: photoVisibilityEnum }).notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("garden_notes", table.tenantId)],
).enableRLS();
