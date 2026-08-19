import "server-only";
import type { GrowingAreaType, SizeUnit } from "@/db/schema";

export type GrowingAreaRowParams = {
  tenantId: string;
  userId: string;
  type: GrowingAreaType;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
  heightCm: number | null;
  sourceUserEquipmentId: string;
  // Only ever set by confirmGrowingAreaProposalsAction, for a fixed-type
  // area (bed/raised_bed) whose position came from a photo estimate — every
  // other caller (syncGrowingAreasAction's manual increase branch,
  // equipmentRows.ts's automatic on-save placement) has no position to give
  // a row yet, so these stay undefined there and the column defaults to
  // null exactly as it already did before these fields existed.
  positionXCm?: number | null;
  positionYCm?: number | null;
};

// Pure data-shaping, no DB access — shared by syncGrowingAreas.ts's manual
// increase branch and equipmentRows.ts's automatic on-save placement, so the
// two insert shapes can't silently drift apart. `overrides[i]` (if given)
// is shallow-merged onto row `i` — lets a caller with a batch of otherwise-
// identical rows (same type/size, one userEquipment quantity) still give
// each physical instance its own distinct fields, e.g. a per-instance
// position, without every other caller needing to know that's possible.
export function buildGrowingAreaRows(
  params: GrowingAreaRowParams,
  count: number,
  overrides?: Partial<GrowingAreaRowParams>[],
) {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({ ...params, ...(overrides?.[i] ?? {}) }));
}
