import type { GrowingAreaType } from "@/db/schema";

export const growingAreaTypeLabels: Record<GrowingAreaType, string> = {
  seed_tray: "Seed tray",
  pot: "Pot",
  planter: "Planter",
  raised_bed: "Raised bed",
  bed: "Garden bed",
};

export const growingAreaTypeEmoji: Record<GrowingAreaType, string> = {
  seed_tray: "🌱",
  pot: "🪴",
  planter: "🪵",
  raised_bed: "🧱",
  bed: "🌻",
};
