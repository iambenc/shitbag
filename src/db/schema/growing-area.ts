import { pgTable, uuid, text, real, integer, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { userEquipment, sizeUnitEnum } from "./equipment";
import { tenantIsolationPolicy } from "./_rls";

// Excludes "watering_can" (a tool, not growing space). Includes "seed_tray" —
// the spec's own worked example ("seed tray frees up, pot marked in-use")
// requires seed trays to be trackable the same way as pots. "greenhouse"/
// "mini_greenhouse"/"cold_frame"/"polytunnel" are the only types with a
// meaningful heightCm (see below) — see HEIGHT_TYPES/hasHeight in
// src/lib/garden/layout.ts. "grow_bag" is sized like "pot" (litres/cm), not
// dimensioned. This is a plain text column with no DB-level enum/CHECK
// constraint, so adding values here is a pure TypeScript change — no
// migration needed for this line by itself (confirmed against every
// migration in this repo's history: none of them ever ALTER TYPE/CREATE
// TYPE anything).
export const growingAreaTypeEnum = [
  "seed_tray",
  "pot",
  "grow_bag",
  "planter",
  "raised_bed",
  "bed",
  "greenhouse",
  "mini_greenhouse",
  "cold_frame",
  "polytunnel",
] as const;
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
    // How tall the structure itself stands — a genuinely different physical
    // fact from depthCm above (soil/growing-medium depth). Only meaningful
    // for greenhouse/mini_greenhouse/cold_frame today (see hasHeight in
    // src/lib/garden/layout.ts); left null for every other type, same as
    // depthCm is left null wherever it doesn't apply.
    heightCm: real("height_cm"),
    status: text("status", { enum: growingAreaStatusEnum }).notNull().default("available"),
    // Nullable: Phase 2 always sets this (placed from owned equipment), but
    // the model allows a future growing area with no equipment provenance
    // (e.g. an in-ground bed that was never tracked as "owned").
    sourceUserEquipmentId: uuid("source_user_equipment_id").references(() => userEquipment.id, {
      onDelete: "set null",
    }),
    // Set when this area is physically placed inside another growing area —
    // today only a HEIGHT_TYPES structure (greenhouse/mini_greenhouse/
    // cold_frame/polytunnel — the ones with real interior space; see
    // src/lib/garden/layout.ts) can be a parent, and only a
    // CONTAINER_GROWING_AREA_TYPES type (seed tray/pot/grow bag/planter —
    // see src/lib/garden/equipmentMapping.ts) can be a child; enforced in
    // the server actions that set this, not at the schema level. Null means
    // "not inside anything" — a top-level area on the user's one main plot,
    // same as every area was before this column existed. ON DELETE SET NULL
    // (not cascade) matches sourceUserEquipmentId's convention above: if a
    // parent structure row is ever removed, its contents fall back to
    // unparented rather than disappearing with it.
    parentGrowingAreaId: uuid("parent_growing_area_id").references((): AnyPgColumn => growingAreas.id, {
      onDelete: "set null",
    }),
    // Where this area sits on the user's /garden/layout canvas, in cm from
    // the plot's top-left corner. Null means "not yet placed on the
    // canvas" — orthogonal to `status` above, which tracks claim/ownership
    // for grow-plan purposes, not visual layout. Never written during a
    // page render (see packGrowingAreas) — only ever set by an explicit
    // user action (drag, or adding a new area from the layout canvas).
    positionXCm: real("position_x_cm"),
    positionYCm: real("position_y_cm"),
    // Clockwise degrees from the area's stored widthCm/lengthCm orientation —
    // always one of 0/90/180/270 (see nextRotationDeg in
    // src/lib/garden/layout.ts). Independent of position: an area can be
    // rotated whether it's placed on the plot or still sitting unplaced in
    // the canvas's tray, and rotating never changes the stored widthCm/
    // lengthCm themselves, only which one acts as the on-canvas footprint's
    // effective width vs. length (see rotatedFootprintCm).
    rotationDeg: integer("rotation_deg").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("growing_areas", table.tenantId)],
).enableRLS();
