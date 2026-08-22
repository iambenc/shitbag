// harvestLog.unit is free text, not an enum — a total is only meaningful
// for recognized weight units. Returns null for anything else (pieces,
// bunches, punnets, ...) so callers can skip it from a sum rather than
// silently mixing units. Case-insensitive, a small fixed set — no unit
// library, this app only ever asks for a plain text unit at log time.
export function normalizeToKg(quantity: number, unit: string): number | null {
  const u = unit.trim().toLowerCase();
  if (u === "kg" || u === "kgs" || u === "kilogram" || u === "kilograms") return quantity;
  if (u === "g" || u === "gram" || u === "grams") return quantity / 1000;
  return null;
}

export function totalKg(rows: { quantity: number; unit: string }[]): number {
  return rows.reduce((sum, r) => sum + (normalizeToKg(r.quantity, r.unit) ?? 0), 0);
}

export type HarvestForAggregate = {
  cropId: string;
  cropName: string;
  cropEmoji: string;
  quantity: number;
  unit: string;
};

export type MostHarvested = { cropName: string; cropEmoji: string; totalKg: number };

// Only ever considers weight-unit rows (see normalizeToKg) — a crop logged
// only in "pieces" can't be compared against one logged in kg, so it simply
// can't win this specific card. Returns null when no weight-unit harvest
// exists at all, rather than guessing.
export function mostHarvestedCrop(rows: HarvestForAggregate[]): MostHarvested | null {
  const totals = new Map<string, MostHarvested>();
  for (const row of rows) {
    const kg = normalizeToKg(row.quantity, row.unit);
    if (kg === null) continue;
    const existing = totals.get(row.cropId);
    if (existing) {
      existing.totalKg += kg;
    } else {
      totals.set(row.cropId, { cropName: row.cropName, cropEmoji: row.cropEmoji, totalKg: kg });
    }
  }
  let best: MostHarvested | null = null;
  for (const entry of totals.values()) {
    if (!best || entry.totalKg > best.totalKg) best = entry;
  }
  return best;
}
