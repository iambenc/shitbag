import { pgTable, uuid, text, integer, real, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenant";
import { users } from "./user";
import { crops } from "./crop";
import { tenantIsolationPolicy } from "./_rls";

// Which attribute inputs the equipment picker UI shows for a type:
// "count" -> just a quantity stepper (watering can, seed trays)
// "sized" -> repeatable size-label + quantity rows (pots)
// "dimensions" -> repeatable width/length/(depth) + quantity rows (planters, raised beds, beds)
export const equipmentCategoryEnum = ["count", "sized", "dimensions"] as const;
export type EquipmentCategory = (typeof equipmentCategoryEnum)[number];

// A "sized" quantity (today, a pot) can be given as a diameter in cm or a
// volume in litres — two different physical measurements, so both a value
// and which unit it's in need storing, not just one opaque label.
export const sizeUnitEnum = ["cm", "litres"] as const;
export type SizeUnit = (typeof sizeUnitEnum)[number];

export const equipmentTypes = pgTable(
  "equipment_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    category: text("category", { enum: equipmentCategoryEnum }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    unique("equipment_types_tenant_slug_unique").on(table.tenantId, table.slug),
    tenantIsolationPolicy("equipment_types", table.tenantId),
  ],
).enableRLS();

// Exactly one of equipmentTypeId/cropId is set — an affiliate/shop link for
// either an equipment type or a crop (seeds), never both. Mirrors
// shoppingListItems' identical "num_nonnulls(...) = 1" pattern. cropId
// points at the global, un-tenanted `crops` catalog (no RLS of its own) —
// same shape as shoppingListItems.cropId already does; the link row itself
// stays tenant-scoped via tenantId/RLS regardless of which catalog it
// points into.
export const partnerLinks = pgTable(
  "partner_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid("equipment_type_id").references(() => equipmentTypes.id, { onDelete: "cascade" }),
    cropId: uuid("crop_id").references(() => crops.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    tenantIsolationPolicy("partner_links", table.tenantId),
    check(
      "partner_links_exactly_one_of",
      sql`num_nonnulls(${table.equipmentTypeId}, ${table.cropId}) = 1`,
    ),
  ],
).enableRLS();

export const userEquipment = pgTable(
  "user_equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    equipmentTypeId: uuid("equipment_type_id")
      .notNull()
      .references(() => equipmentTypes.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    // Only one of these is populated, depending on the equipment type's category.
    sizeValue: real("size_value"),
    sizeUnit: text("size_unit", { enum: sizeUnitEnum }),
    widthCm: real("width_cm"),
    lengthCm: real("length_cm"),
    depthCm: real("depth_cm"),
  },
  (table) => [tenantIsolationPolicy("user_equipment", table.tenantId)],
).enableRLS();
