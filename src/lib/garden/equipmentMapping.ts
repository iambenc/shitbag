import type { GrowingAreaType } from "@/db/schema";

/** Which seeded equipment types can become growing areas, and what type each maps to. */
export const SLUG_TO_GROWING_AREA_TYPE: Record<string, GrowingAreaType> = {
  "seed-trays": "seed_tray",
  pots: "pot",
  planters: "planter",
  "raised-beds": "raised_bed",
  "garden-beds": "bed",
};

/** The reverse of SLUG_TO_GROWING_AREA_TYPE — given a growing area type, which seeded equipment type slug owns it. */
export const GROWING_AREA_TYPE_TO_SLUG: Record<GrowingAreaType, string> = Object.fromEntries(
  Object.entries(SLUG_TO_GROWING_AREA_TYPE).map(([slug, type]) => [type, slug]),
) as Record<GrowingAreaType, string>;

/**
 * Growing-space types that are actually a *product* someone can buy —
 * excludes "garden-beds": unlike pots/planters/raised beds/seed trays, a
 * garden bed isn't purchased, it's just ground in the user's own garden
 * they've designated for growing. Garden beds stay a valid *placeable*
 * growing area (SLUG_TO_GROWING_AREA_TYPE is unchanged), just never
 * suggested as something to shop for.
 */
export const PURCHASABLE_GROWING_SPACE_SLUGS = Object.keys(SLUG_TO_GROWING_AREA_TYPE).filter(
  (slug) => slug !== "garden-beds",
);
