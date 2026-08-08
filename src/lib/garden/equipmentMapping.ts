import type { GrowingAreaType } from "@/db/schema";

/** Which seeded equipment types can become growing areas, and what type each maps to. */
export const SLUG_TO_GROWING_AREA_TYPE: Record<string, GrowingAreaType> = {
  "seed-trays": "seed_tray",
  pots: "pot",
  planters: "planter",
  "raised-beds": "raised_bed",
  "garden-beds": "bed",
};
