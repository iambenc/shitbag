import "server-only";

// Only weight-based units can be meaningfully compared against a crop's
// £/kg retail estimate — "3 punnets" or "2 bunches" can't be converted
// without knowing what a punnet/bunch weighs, so those entries are
// deliberately excluded from the total rather than guessed at. harvestLog's
// `unit` column is free text (see harvest.ts), so this is necessarily a
// small recognized allowlist, not an exhaustive parser.
const KG_PER_UNIT: Record<string, number> = {
  kg: 1,
  kilogram: 1,
  kilograms: 1,
  g: 0.001,
  gram: 0.001,
  grams: 0.001,
};

export type HarvestForSavings = {
  quantity: number;
  unit: string;
  cropSlug: string;
  cropName: string;
  cropEmoji: string;
  estimatedRetailPricePerKgGbp: number;
};

export type CropSavings = {
  cropSlug: string;
  cropName: string;
  cropEmoji: string;
  kg: number;
  savedGbp: number;
};

export type SavingsSummary = {
  totalSavedGbp: number;
  byCrop: CropSavings[];
  includedCount: number;
  excludedCount: number;
};

export function computeSavings(harvests: HarvestForSavings[]): SavingsSummary {
  const byCropMap = new Map<string, CropSavings>();
  let excludedCount = 0;

  for (const h of harvests) {
    const factor = KG_PER_UNIT[h.unit.trim().toLowerCase()];
    if (factor === undefined) {
      excludedCount++;
      continue;
    }
    const kg = h.quantity * factor;
    const savedGbp = kg * h.estimatedRetailPricePerKgGbp;
    const existing = byCropMap.get(h.cropSlug);
    if (existing) {
      existing.kg += kg;
      existing.savedGbp += savedGbp;
    } else {
      byCropMap.set(h.cropSlug, {
        cropSlug: h.cropSlug,
        cropName: h.cropName,
        cropEmoji: h.cropEmoji,
        kg,
        savedGbp,
      });
    }
  }

  const byCrop = [...byCropMap.values()].sort((a, b) => b.savedGbp - a.savedGbp);
  const totalSavedGbp = byCrop.reduce((sum, c) => sum + c.savedGbp, 0);

  return {
    totalSavedGbp,
    byCrop,
    includedCount: harvests.length - excludedCount,
    excludedCount,
  };
}
