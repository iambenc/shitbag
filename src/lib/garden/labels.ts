import type { GrowingAreaType, SizeUnit } from "@/db/schema";

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

// A "sized" quantity (today, a pot) can be a cm diameter or a litres volume —
// two different measurements, so both the value and its unit matter.
export function formatSizeValue(value: number | null, unit: SizeUnit | null): string | null {
  if (value == null || unit == null) return null;
  return unit === "litres" ? `${value}L` : `${value}cm`;
}
