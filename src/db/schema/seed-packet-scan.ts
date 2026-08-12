import { pgTable, uuid, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { tenantIsolationPolicy } from "./_rls";

// One row per scanSeedPacketAction call — exists purely to back the daily
// rate cap (getSeedPacketScansToday), same "a real row the cap can count"
// convention every other AI-cost action in this app follows. Deliberately
// NOT a review-queue record: the scan is a one-shot form-autofill, nothing
// is persisted or revisited later, and the photo itself is never stored —
// converted to a Buffer, sent straight to the vision call, then discarded
// (see scanSeedPacketAction). No result columns here either — the extracted
// fields only ever live in the response returned to the client for that one
// request.
export const seedPacketScans = pgTable(
  "seed_packet_scans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("seed_packet_scans", table.tenantId)],
).enableRLS();
