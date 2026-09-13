"use server";

import { eq, and, isNull } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { userEquipment, equipmentTypes, growingAreas, userProfiles } from "@/db/schema";
import type { GrowingAreaType, SizeUnit } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { GROWING_AREA_TYPE_TO_SLUG } from "@/lib/garden/equipmentMapping";
import { buildGrowingAreaRows } from "@/lib/garden/growingAreaSync";
import { validateStructureParent } from "@/lib/garden/structureAssignment";

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
  parentGrowingAreaId: string | null,
): Promise<SaveGrowingAreaPositionResult> {
  const { userId, tenantId } = await requireSessionAndTenant();

  if (!Number.isFinite(xCm) || !Number.isFinite(yCm) || xCm < 0 || yCm < 0) {
    return { ok: false, error: "That's not a valid position." };
  }

  return withTenant(tenantId, async (tx) => {
    if (parentGrowingAreaId) {
      const [area] = await tx
        .select({ type: growingAreas.type })
        .from(growingAreas)
        .where(and(eq(growingAreas.id, growingAreaId), eq(growingAreas.userId, userId)));
      if (!area) return { ok: false, error: "Growing area not found." };
      const error = await validateStructureParent(tx, userId, parentGrowingAreaId, area.type);
      if (error) return { ok: false, error };
    }

    const [row] = await tx
      .update(growingAreas)
      .set({ positionXCm: xCm, positionYCm: yCm, parentGrowingAreaId })
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
    // Dragging fully off any canvas (main plot or a structure's own
    // sub-plot) returns an area to the global unplaced pool — nulling
    // parentGrowingAreaId here too, not just position, is what makes that
    // true regardless of which canvas the drag started on. A no-op for a
    // top-level area, which already has a null parent.
    const [row] = await tx
      .update(growingAreas)
      .set({ positionXCm: null, positionYCm: null, parentGrowingAreaId: null })
      .where(and(eq(growingAreas.id, growingAreaId), eq(growingAreas.userId, userId)))
      .returning({ id: growingAreas.id });
    if (!row) return { ok: false, error: "Growing area not found." };
    return { ok: true };
  });
}

/**
 * Persists a rotate-button click — independent of position, so this works
 * identically whether the area is already placed on the plot or still
 * sitting unplaced in the tray (see the rotationDeg column comment on
 * growingAreas). The client always computes the next value via
 * nextRotationDeg and passes it here; re-validated server-side rather than
 * trusted, same caution saveGrowingAreaPositionAction already applies to
 * xCm/yCm.
 */
export async function setGrowingAreaRotationAction(
  growingAreaId: string,
  rotationDeg: number,
): Promise<SaveGrowingAreaPositionResult> {
  const { userId, tenantId } = await requireSessionAndTenant();

  if (![0, 90, 180, 270].includes(rotationDeg)) {
    return { ok: false, error: "That's not a valid rotation." };
  }

  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .update(growingAreas)
      .set({ rotationDeg })
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
        heightCm: number | null;
        positionXCm: number | null;
        positionYCm: number | null;
        rotationDeg: number;
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
  heightCm: number | null;
  parentGrowingAreaId: string | null;
}): Promise<AddGrowingAreaFromLayoutResult> {
  const { userId, tenantId } = await requireSessionAndTenant();

  return withTenant(tenantId, async (tx) => {
    if (params.parentGrowingAreaId) {
      const error = await validateStructureParent(tx, userId, params.parentGrowingAreaId, params.type);
      if (error) return { ok: false, error };
    }

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
        heightCm: params.heightCm,
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
            heightCm: params.heightCm,
            sourceUserEquipmentId: equipmentRow.id,
          },
          1,
        ).map((row) => ({
          ...row,
          status: "available" as const,
          positionXCm: null,
          positionYCm: null,
          parentGrowingAreaId: params.parentGrowingAreaId,
        })),
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
        heightCm: newArea.heightCm,
        positionXCm: newArea.positionXCm,
        positionYCm: newArea.positionYCm,
        rotationDeg: newArea.rotationDeg,
      },
    };
  });
}

export type ResetLayoutResult = { ok: true } | { ok: false; error: string };

/**
 * Clears the user's growing areas back to unpositioned — they all land back
 * in the relevant canvas's "not yet placed" tray, same as any newly-added
 * area. Doesn't touch `status`/ownership/parentGrowingAreaId/anything else,
 * purely the layout. Scoped by `scopeToParentId` so the main plot's reset
 * button (called with null) only resets top-level areas — it can't silently
 * evict everything placed inside every structure's own sub-plot, which
 * reset from a structure's own page (called with that structure's id) is
 * the only thing that should ever do.
 */
export async function resetLayoutAction(scopeToParentId: string | null): Promise<ResetLayoutResult> {
  const { userId, tenantId } = await requireSessionAndTenant();

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(growingAreas)
      .set({ positionXCm: null, positionYCm: null })
      .where(
        and(
          eq(growingAreas.userId, userId),
          scopeToParentId ? eq(growingAreas.parentGrowingAreaId, scopeToParentId) : isNull(growingAreas.parentGrowingAreaId),
        ),
      );
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
