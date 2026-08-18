"use server";

import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { userEquipment, equipmentTypes, growingAreas, userProfiles } from "@/db/schema";
import type { GrowingAreaType, SizeUnit } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { GROWING_AREA_TYPE_TO_SLUG } from "@/lib/garden/equipmentMapping";
import { buildGrowingAreaRows } from "@/lib/garden/growingAreaSync";

export type SaveGrowingAreaPositionResult = { ok: true } | { ok: false; error: string };

/**
 * Persists a drag's final position — the ONLY place a growing area's
 * position is ever written outside of addGrowingAreaFromLayoutAction below.
 * Last-write-wins, no locking, same tolerance level syncGrowingAreasAction
 * already has for this kind of single-row update.
 */
export async function saveGrowingAreaPositionAction(
  growingAreaId: string,
  xCm: number,
  yCm: number,
): Promise<SaveGrowingAreaPositionResult> {
  const { userId, tenantId } = await requireSessionAndTenant();

  if (!Number.isFinite(xCm) || !Number.isFinite(yCm) || xCm < 0 || yCm < 0) {
    return { ok: false, error: "That's not a valid position." };
  }

  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .update(growingAreas)
      .set({ positionXCm: xCm, positionYCm: yCm })
      .where(and(eq(growingAreas.id, growingAreaId), eq(growingAreas.userId, userId)))
      .returning({ id: growingAreas.id });
    if (!row) return { ok: false, error: "Growing area not found." };
    return { ok: true };
  });
}

/**
 * Clears a single growing area's position — dragging it off the plot onto
 * the canvas's "not yet placed" tray. Doesn't touch `status`/ownership,
 * purely the layout; the area is still owned, just not on the plot.
 */
export async function unplaceGrowingAreaAction(growingAreaId: string): Promise<SaveGrowingAreaPositionResult> {
  const { userId, tenantId } = await requireSessionAndTenant();

  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .update(growingAreas)
      .set({ positionXCm: null, positionYCm: null })
      .where(and(eq(growingAreas.id, growingAreaId), eq(growingAreas.userId, userId)))
      .returning({ id: growingAreas.id });
    if (!row) return { ok: false, error: "Growing area not found." };
    return { ok: true };
  });
}

export type AddGrowingAreaFromLayoutResult =
  | {
      ok: true;
      area: {
        id: string;
        type: GrowingAreaType;
        sizeValue: number | null;
        sizeUnit: SizeUnit | null;
        widthCm: number | null;
        lengthCm: number | null;
        depthCm: number | null;
        positionXCm: number | null;
        positionYCm: number | null;
      };
    }
  | { ok: false; error: string };

/**
 * Adds one new growing area directly from the layout canvas — both the
 * owned-equipment row (quantity 1) and its growingAreas row, in one
 * transaction, same as confirmGrowingAreaProposalsAction's pattern.
 * Deliberately does NOT call applyEquipmentRows: that helper is a full
 * delete-then-upsert built for EquipmentPicker's always-resubmit-the-whole-
 * set contract — calling it with just this one new row would delete every
 * other piece of equipment the user owns.
 *
 * Always inserted unpositioned — it lands in the canvas's "not yet placed"
 * tray, same as any other never-placed area, and the user drags it onto
 * the plot themselves. No longer auto-computes a starting spot on the plot
 * (that used to call findFreePosition here); the whole point of the tray
 * is that nothing appears on the plot without the user having put it there.
 */
export async function addGrowingAreaFromLayoutAction(params: {
  type: GrowingAreaType;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
}): Promise<AddGrowingAreaFromLayoutResult> {
  const { userId, tenantId } = await requireSessionAndTenant();

  return withTenant(tenantId, async (tx) => {
    const slug = GROWING_AREA_TYPE_TO_SLUG[params.type];
    const [equipmentType] = await tx
      .select({ id: equipmentTypes.id })
      .from(equipmentTypes)
      .where(and(eq(equipmentTypes.tenantId, tenantId), eq(equipmentTypes.slug, slug)));
    if (!equipmentType) return { ok: false, error: "That growing area type isn't available." };

    const [equipmentRow] = await tx
      .insert(userEquipment)
      .values({
        tenantId,
        userId,
        equipmentTypeId: equipmentType.id,
        quantity: 1,
        sizeValue: params.sizeValue,
        sizeUnit: params.sizeUnit,
        widthCm: params.widthCm,
        lengthCm: params.lengthCm,
        depthCm: params.depthCm,
      })
      .returning({ id: userEquipment.id });

    const [newArea] = await tx
      .insert(growingAreas)
      .values(
        buildGrowingAreaRows(
          {
            tenantId,
            userId,
            type: params.type,
            sizeValue: params.sizeValue,
            sizeUnit: params.sizeUnit,
            widthCm: params.widthCm,
            lengthCm: params.lengthCm,
            depthCm: params.depthCm,
            sourceUserEquipmentId: equipmentRow.id,
          },
          1,
        ).map((row) => ({ ...row, status: "available" as const, positionXCm: null, positionYCm: null })),
      )
      .returning();

    return {
      ok: true,
      area: {
        id: newArea.id,
        type: newArea.type,
        sizeValue: newArea.sizeValue,
        sizeUnit: newArea.sizeUnit,
        widthCm: newArea.widthCm,
        lengthCm: newArea.lengthCm,
        depthCm: newArea.depthCm,
        positionXCm: newArea.positionXCm,
        positionYCm: newArea.positionYCm,
      },
    };
  });
}

export type ResetLayoutResult = { ok: true } | { ok: false; error: string };

/**
 * Clears every one of the user's growing areas back to unpositioned — they
 * all land back in the canvas's "not yet placed" tray, same as any
 * newly-added area. Doesn't touch `status`/ownership/anything else, purely
 * the layout.
 */
export async function resetLayoutAction(): Promise<ResetLayoutResult> {
  const { userId, tenantId } = await requireSessionAndTenant();

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(growingAreas)
      .set({ positionXCm: null, positionYCm: null })
      .where(eq(growingAreas.userId, userId));
  });

  return { ok: true };
}

export type SetPlotBoundaryResult = { ok: true } | { ok: false; error: string };

/**
 * Free (no paid-tier check) — /garden and /garden/layout are both free
 * features today, only the AI photo-estimate action is paid-gated, so a
 * free-tier user still needs some way to ever set a plot boundary.
 */
export async function setPlotBoundaryAction(widthCm: number, lengthCm: number): Promise<SetPlotBoundaryResult> {
  const { userId, tenantId } = await requireSessionAndTenant();

  if (!Number.isFinite(widthCm) || !Number.isFinite(lengthCm) || widthCm <= 0 || lengthCm <= 0) {
    return { ok: false, error: "Enter a width and length greater than zero." };
  }

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(userProfiles)
      .set({ plotWidthCm: widthCm, plotLengthCm: lengthCm, plotBoundarySource: "manual", updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
  });

  return { ok: true };
}
