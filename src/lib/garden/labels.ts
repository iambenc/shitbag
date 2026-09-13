import type { GrowingAreaType, SizeUnit } from "@/db/schema";

export const growingAreaTypeLabels: Record<GrowingAreaType, string> = {
  seed_tray: "Seed tray",
  pot: "Pot",
  grow_bag: "Grow bag",
  planter: "Planter",
  raised_bed: "Raised bed",
  bed: "Garden bed",
  greenhouse: "Greenhouse",
  mini_greenhouse: "Mini greenhouse",
  cold_frame: "Cold frame",
  polytunnel: "Polytunnel",
};

export const growingAreaTypeEmoji: Record<GrowingAreaType, string> = {
  seed_tray: "🌱",
  pot: "🪴",
  grow_bag: "🛍️",
  planter: "🪵",
  raised_bed: "🧱",
  bed: "🌻",
  greenhouse: "🏠",
  mini_greenhouse: "⛺",
  cold_frame: "🖼️",
  polytunnel: "🎪",
};

// A "sized" quantity (today, a pot) can be a cm diameter or a litres volume —
// two different measurements, so both the value and its unit matter.
export function formatSizeValue(value: number | null, unit: SizeUnit | null): string | null {
  if (value == null || unit == null) return null;
  return unit === "litres" ? `${value}L` : `${value}cm`;
}

// No growing area has a user-given name (see growing-area.ts's schema
// comment) — this computes a display label from what does exist (type +
// size) for anywhere the UI needs to refer to one, e.g. "20cm Pot",
// "Greenhouse". Callers showing a whole list of a user's areas (My Garden
// grid) should additionally dedupe identical labels with a numeric suffix
// themselves — this function only knows about the one area passed in.
export function growingAreaBaseLabel(area: {
  type: GrowingAreaType;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
}): string {
  const typeLabel = growingAreaTypeLabels[area.type];
  const sized = formatSizeValue(area.sizeValue, area.sizeUnit);
  const dims = sized ?? (area.widthCm && area.lengthCm ? `${area.widthCm}×${area.lengthCm}cm` : null);
  return dims ? `${dims} ${typeLabel}` : typeLabel;
}
