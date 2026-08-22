// Small computed label for a harvest — no stored "name" field on harvestLog
// (same reasoning as growingAreaBaseLabel in src/lib/garden/labels.ts: build
// a display string from what's actually stored rather than adding a
// redundant name column). Used both by the harvests page itself (photo
// caption default) and by the journal grid's tag line for a harvest-linked
// photo.
export function harvestSummaryLabel(harvest: {
  quantity: number;
  unit: string;
  cropName: string;
  varietyName?: string | null;
}): string {
  const crop = harvest.varietyName ? `${harvest.cropName} (${harvest.varietyName})` : harvest.cropName;
  return `${harvest.quantity}${harvest.unit} ${crop} harvest`;
}
