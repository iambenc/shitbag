import type { GrowingAreaType } from "@/db/schema";

/** Which seeded equipment types can become growing areas, and what type each maps to. */
export const SLUG_TO_GROWING_AREA_TYPE: Record<string, GrowingAreaType> = {
  "seed-trays": "seed_tray",
  pots: "pot",
  planters: "planter",
  "raised-beds": "raised_bed",
  "garden-beds": "bed",
  greenhouses: "greenhouse",
  "mini-greenhouses": "mini_greenhouse",
  "cold-frames": "cold_frame",
};

/** The reverse of SLUG_TO_GROWING_AREA_TYPE — given a growing area type, which seeded equipment type slug owns it. */
export const GROWING_AREA_TYPE_TO_SLUG: Record<GrowingAreaType, string> = Object.fromEntries(
  Object.entries(SLUG_TO_GROWING_AREA_TYPE).map(([slug, type]) => [type, slug]),
) as Record<GrowingAreaType, string>;

/**
 * Display-only split of SLUG_TO_GROWING_AREA_TYPE's growing-space slugs into
 * small containers vs. freestanding structures, for My Shed's separate
 * "Planting equipment"/"Garden structures" tabs — purely a UI grouping, not
 * a new stored concept. Every other SLUG_TO_GROWING_AREA_TYPE slug (raised
 * beds, garden beds, greenhouses, mini greenhouses, cold frames) is a
 * "structure", derived rather than listed twice.
 */
export const CONTAINER_SLUGS = ["seed-trays", "pots", "planters"];
