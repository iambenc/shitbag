import { pgTable, uuid, text, real, date, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { crops, cropVarieties } from "./crop";
import { tenantIsolationPolicy } from "./_rls";

export const harvestLog = pgTable(
  "harvest_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cropId: uuid("crop_id")
      .notNull()
      .references(() => crops.id, { onDelete: "cascade" }),
    // Nullable, user-picked from a dependent dropdown (see HarvestsView.tsx)
    // — never AI-resolved here, only ever references an already-existing
    // crop_varieties row.
    varietyId: uuid("variety_id").references(() => cropVarieties.id, { onDelete: "set null" }),
    quantity: real("quantity").notNull(),
    unit: text("unit").notNull(),
    harvestedAt: date("harvested_at", { mode: "string" }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("harvest_log", table.tenantId)],
).enableRLS();
