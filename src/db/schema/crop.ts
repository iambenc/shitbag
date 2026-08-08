import { pgTable, uuid, text, integer, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { users } from "./user";
import { tenantIsolationPolicy } from "./_rls";

export const cropCategoryEnum = ["fruit", "vegetable", "herb"] as const;
export type CropCategory = (typeof cropCategoryEnum)[number];

// Global reference catalog — deliberately NOT tenant-scoped. Every tenant
// (including future white-label ones) reads the same crop data; there's no
// per-tenant customization need for this yet, so no tenant_id/RLS here.
export const crops = pgTable("crops", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  category: text("category", { enum: cropCategoryEnum }).notNull(),
  emoji: text("emoji").notNull(),
  spacingCm: integer("spacing_cm").notNull(),
  soilDepthCm: integer("soil_depth_cm").notNull(),
  sowIndoorFromMonth: integer("sow_indoor_from_month"),
  sowIndoorToMonth: integer("sow_indoor_to_month"),
  sowOutdoorFromMonth: integer("sow_outdoor_from_month"),
  sowOutdoorToMonth: integer("sow_outdoor_to_month"),
  daysToHarvestMin: integer("days_to_harvest_min").notNull(),
  daysToHarvestMax: integer("days_to_harvest_max").notNull(),
  supportsSuccessionSowing: boolean("supports_succession_sowing").notNull().default(false),
  feedingNotes: text("feeding_notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const userFavoriteCrops = pgTable(
  "user_favorite_crops",
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
    liked: boolean("liked").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("user_favorite_crops_user_crop_unique").on(table.userId, table.cropId),
    tenantIsolationPolicy("user_favorite_crops", table.tenantId),
  ],
).enableRLS();

export const seedSourceEnum = ["onboarding", "purchased"] as const;
export type SeedSource = (typeof seedSourceEnum)[number];

export const seedInventory = pgTable(
  "seed_inventory",
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
    quantityLabel: text("quantity_label").notNull(),
    source: text("source", { enum: seedSourceEnum }).notNull().default("onboarding"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("seed_inventory", table.tenantId)],
).enableRLS();
