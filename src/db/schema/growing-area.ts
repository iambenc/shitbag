import { pgTable, uuid, text, real, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { userEquipment, sizeUnitEnum } from "./equipment";
import { tenantIsolationPolicy } from "./_rls";

// Excludes "watering_can" (a tool, not growing space). Includes "seed_tray" —
// the spec's own worked example ("seed tray frees up, pot marked in-use")
// requires seed trays to be trackable the same way as pots.
export const growingAreaTypeEnum = ["seed_tray", "pot", "planter", "raised_bed", "bed"] as const;
export type GrowingAreaType = (typeof growingAreaTypeEnum)[number];

// "reserved" = earmarked for a later stage of a specific recommendation's
// multi-stage lifecycle (e.g. the pot a seed-tray crop will move into) —
// claimed so nothing else can take it, but not physically holding anything
// yet. See planRecommendationStages in grow-plan.ts.
export const growingAreaStatusEnum = ["available", "reserved", "in_use"] as const;
export type GrowingAreaStatus = (typeof growingAreaStatusEnum)[number];

// Deliberately no `quantity` column: unlike userEquipment ("3x 20cm pots" as
// one row), each row here is exactly one physical, independently-trackable
// unit — that's the whole point of this table existing separately from
// userEquipment (owned vs. currently placed/in-use).
export const growingAreas = pgTable(
  "growing_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: growingAreaTypeEnum }).notNull(),
    sizeValue: real("size_value"),
    sizeUnit: text("size_unit", { enum: sizeUnitEnum }),
    widthCm: real("width_cm"),
    lengthCm: real("length_cm"),
    depthCm: real("depth_cm"),
    status: text("status", { enum: growingAreaStatusEnum }).notNull().default("available"),
    // Nullable: Phase 2 always sets this (placed from owned equipment), but
    // the model allows a future growing area with no equipment provenance
    // (e.g. an in-ground bed that was never tracked as "owned").
    sourceUserEquipmentId: uuid("source_user_equipment_id").references(() => userEquipment.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("growing_areas", table.tenantId)],
).enableRLS();
