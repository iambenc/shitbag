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
