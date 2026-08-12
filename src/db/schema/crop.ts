import { pgTable, uuid, text, integer, real, boolean, timestamp, unique } from "drizzle-orm/pg-core";
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
  // AI/curator's best-guess typical UK retail price, GBP per kg (or
  // kg-equivalent for crops normally sold by bunch/head/unit) — used to bias
  // the grow planner toward crops that are relatively expensive to buy, so
  // growing them yourself returns more value. Unlike feedingNotes there's no
  // legitimate "null" case (every crop has some retail cost), so this is
  // required like spacingCm/soilDepthCm rather than nullable. The 0 default
  // exists only to let the ADD COLUMN migration run non-interactively — every
  // real write path (seed data, cropFacts.ts) always supplies a real
  // estimate, so 0 is never a genuine price; unlike a counter, a forgotten
  // insert here fails silently rather than obviously.
  estimatedRetailPricePerKgGbp: real("estimated_retail_price_per_kg_gbp").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  // Curated/seeded rows default true. AI-backfilled rows (see cropFacts.ts)
  // set false and stamp sourceProvider/sourceModel — "mock" for the dev
  // fallback, so a future admin-review pass can tell a fabricated stub
  // apart from a real (if unreviewed) AI attempt, which otherwise look
  // identical once persisted.
  verified: boolean("verified").notNull().default(true),
  sourceProvider: text("source_provider"),
  sourceModel: text("source_model"),
});

// A specific cultivar of a crop (e.g. "Moneymaker" for Tomato) — global
// reference catalog, same as `crops` itself: no tenant_id/RLS, every tenant
// reads the same dataset, AI-backfilled the same way (see varietyFacts.ts).
// Deliberately NOT a full copy of crops' own fact set — spacing, soil depth,
// sow-month windows, succession-sowing support, and feeding needs are
// basically species-level, not variety-level, so duplicating them here would
// mostly just re-state the parent crop's own values. Only the fields that
// genuinely vary by cultivar get an override column, and every override is
// nullable meaning "same as the parent crop," never "zero"/"unknown" —
// callers building an AI-facing catalog resolve these once (crop's own
// value when null) rather than repeating that fallback logic ad hoc.
export const cropVarieties = pgTable(
  "crop_varieties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cropId: uuid("crop_id")
      .notNull()
      .references(() => crops.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    daysToHarvestMin: integer("days_to_harvest_min"),
    daysToHarvestMax: integer("days_to_harvest_max"),
    // Compact/dwarf cultivars often need materially less room than the
    // species' typical spacing (e.g. a patio/bush tomato vs a cordon one).
    spacingCm: integer("spacing_cm"),
    // Free text, not an enum — what's meaningful varies by crop type (bush/
    // cordon/trailing for tomatoes, determinate/indeterminate elsewhere,
    // climbing/dwarf for beans) and forcing one shared enum across every
    // crop category would either be too broad to be useful or need constant
    // extending.
    growthHabit: text("growth_habit"),
    diseaseResistanceNotes: text("disease_resistance_notes"),
    // Short "what makes this cultivar distinct" blurb — flavour, colour,
    // notable traits — surfaced to the grow planner as a tie-breaker signal,
    // not required reading.
    characteristics: text("characteristics"),
    estimatedRetailPricePerKgGbp: real("estimated_retail_price_per_kg_gbp"),
    // Same provenance-stamping convention as crops.verified/sourceProvider/
    // sourceModel — AI-backfilled rows (varietyFacts.ts) set false and stamp
    // both; there's no curated seed data for varieties at launch, so every
    // real row starts out AI-backfilled, but the columns exist for parity/a
    // future admin-review pass same as crops itself.
    verified: boolean("verified").notNull().default(true),
    sourceProvider: text("source_provider"),
    sourceModel: text("source_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("crop_varieties_crop_slug_unique").on(table.cropId, table.slug)],
);

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
    // Nullable: a user may not know/care which cultivar they bought (or
    // onboarding's crop-only picker never asks). "set null" not "cascade" —
    // unlike cropId, a variety row disappearing (e.g. a future admin
    // cleanup) shouldn't take the user's real seed-inventory row with it,
    // it should just fall back to being crop-only again.
    varietyId: uuid("variety_id").references(() => cropVarieties.id, { onDelete: "set null" }),
    quantityLabel: text("quantity_label").notNull(),
    // Nullable: onboarding's seeds step only ever sets quantityLabel (free
    // text, e.g. "1 packet") — this numeric count is only ever populated by
    // the /seeds page's add flow, which asks for it directly. A crop whose
    // only owned rows are onboarding-sourced (null here) reads as "unknown
    // quantity," not "zero" — see toggleTaskCompleteAction's depletion
    // check, which must never conflate the two.
    seedCount: integer("seed_count"),
    source: text("source", { enum: seedSourceEnum }).notNull().default("onboarding"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("seed_inventory", table.tenantId)],
).enableRLS();
