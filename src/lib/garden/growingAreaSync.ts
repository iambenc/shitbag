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
  sourceUserEquipmentId: string;
};

// Pure data-shaping, no DB access — shared by syncGrowingAreas.ts's manual
// increase branch and equipmentRows.ts's automatic on-save placement, so the
// two insert shapes can't silently drift apart.
export function buildGrowingAreaRows(params: GrowingAreaRowParams, count: number) {
  return Array.from({ length: Math.max(0, count) }, () => ({ ...params }));
}
