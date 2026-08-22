import type { GrowingAreaType } from "@/db/schema";

// A separate, richer illustration set for the dashboard's "My Garden" cards —
// deliberately not the same map as LayoutCanvas.tsx's own CUSTOM_ICON_SRC
// (which points at the small flat icons in public/icons/growing-areas/ and
// must keep doing so unchanged). Every type currently has art; the emoji
// fallback below only matters if a 9th type is ever added without a matching
// illustration.
export const GROWING_AREA_ILLUSTRATION_SRC: Partial<Record<GrowingAreaType, string>> = {
  seed_tray: "/illustrations/growing-areas/seed_tray.png",
  pot: "/illustrations/growing-areas/pot.png",
  planter: "/illustrations/growing-areas/planter.png",
  raised_bed: "/illustrations/growing-areas/raised_bed.png",
  bed: "/illustrations/growing-areas/bed.png",
  greenhouse: "/illustrations/growing-areas/greenhouse.png",
  mini_greenhouse: "/illustrations/growing-areas/mini_greenhouse.png",
  cold_frame: "/illustrations/growing-areas/cold_frame.png",
};
