"use server";

import { eq, and, inArray, isNull, count } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { userEquipment, equipmentTypes, growingAreas } from "@/db/schema";
import { SLUG_TO_GROWING_AREA_TYPE } from "@/lib/garden/equipmentMapping";
import { buildGrowingAreaRows } from "@/lib/garden/growingAreaSync";
import { validateStructureParent } from "@/lib/garden/structureAssignment";
import { requireSessionAndTenant } from "@/lib/actions/shared";

export type SyncGrowingAreasResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * Syncs the number of a given `userEquipment` batch's `growingAreas` rows
 * that are placed in the MAIN GARDEN specifically (`parentGrowingAreaId IS
 * NULL`) to `desiredCount` — creating or deleting individual unparented rows
 * as needed. Scoped this way (rather than every row sourced from this
 * equipment, regardless of parent) so this action can never touch a row a
 * user has separately assigned inside a structure via
 * assignEquipmentToStructureAction below — decrementing "placed in the main
 * garden" must only ever free up main-garden capacity, never evict
 * something from a structure it was deliberately placed in.
 *
 * Never trusts `desiredCount` blindly: clamped server-side to [0, quantity
 * owned minus however many are currently assigned to a structure] — this
 * action can only claim capacity that isn't already committed elsewhere,
 * same principle assignEquipmentToStructureAction already applies in
 * reverse. Row removal prefers `available` rows over `in_use` ones.
 */
export async function syncGrowingAreasAction(
  userEquipmentId: string,
  desiredCount: number,
): Promise<SyncGrowingAreasResult> {
  const { userId, tenantId } = await requireSessionAndTenant();

  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ equipment: userEquipment, type: equipmentTypes })
      .from(userEquipment)
      .innerJoin(equipmentTypes, eq(userEquipment.equipmentTypeId, equipmentTypes.id))
      .where(and(eq(userEquipment.id, userEquipmentId), eq(userEquipment.userId, userId)));

    if (!row) return { ok: false, error: "Equipment not found" };

    const growingAreaType = SLUG_TO_GROWING_AREA_TYPE[row.type.slug];
    if (!growingAreaType) {
      return { ok: false, error: "This equipment type can't be used as growing space" };
    }

    const existing = await tx
      .select({ id: growingAreas.id, status: growingAreas.status, parentGrowingAreaId: growingAreas.parentGrowingAreaId })
      .from(growingAreas)
      .where(eq(growingAreas.sourceUserEquipmentId, userEquipmentId));

    const unparented = existing.filter((r) => r.parentGrowingAreaId === null);
    const assignedToStructure = existing.filter((r) => r.parentGrowingAreaId !== null);

    const clamped = Math.max(0, Math.min(Math.trunc(desiredCount), row.equipment.quantity - assignedToStructure.length));

    if (unparented.length < clamped) {
      const newRows = buildGrowingAreaRows(
        {
          tenantId,
          userId,
          type: growingAreaType,
          sizeValue: row.equipment.sizeValue,
          sizeUnit: row.equipment.sizeUnit,
          widthCm: row.equipment.widthCm,
          lengthCm: row.equipment.lengthCm,
          depthCm: row.equipment.depthCm,
          heightCm: row.equipment.heightCm,
          sourceUserEquipmentId: userEquipmentId,
        },
        clamped - unparented.length,
      );
      await tx.insert(growingAreas).values(newRows);
    } else if (unparented.length > clamped) {
      const removable = unparented
        .filter((r) => r.status === "available")
        .slice(0, unparented.length - clamped)
        .map((r) => r.id);
      if (removable.length > 0) {
        await tx.delete(growingAreas).where(inArray(growingAreas.id, removable));
      }
    }

    const [{ value: finalCount }] = await tx
      .select({ value: count() })
      .from(growingAreas)
      .where(and(eq(growingAreas.sourceUserEquipmentId, userEquipmentId), isNull(growingAreas.parentGrowingAreaId)));

    return { ok: true, count: finalCount };
  });
}

/**
 * Sibling to syncGrowingAreasAction above, scoped to one structure — syncs
 * how many of a given userEquipment batch's growingAreas rows are currently
 * placed INSIDE `structureId` (parentGrowingAreaId = structureId) to
 * `desiredCount`. Never trusts `desiredCount` blindly: clamped server-side
 * to [0, quantity owned minus however many rows already exist ANYWHERE else
 * — the main garden or a different structure] — this action can only claim
 * quantity that has no real growingAreas row at all yet.
 *
 * Deliberately does NOT reassign an existing unparented (main garden) row
 * into this structure, unlike an earlier version of this action — an
 * unparented row now specifically MEANS "in the main garden" (that's
 * exactly what syncGrowingAreasAction's own count above is), a deliberate
 * placement of its own, not idle capacity this action is free to silently
 * repurpose. Moving equipment from the main garden into a structure is two
 * explicit steps — reduce it there first (frees the quantity, deleting that
 * row), then increase it here (creates a fresh one) — never one implicit
 * click that would leave the main garden's own displayed count silently
 * stale. Shrinking unassigns (parentGrowingAreaId -> null) rather than
 * deletes — taking equipment out of a structure returns it to the
 * unallocated pool, it doesn't destroy owned equipment (a subsequent main
 * garden or another structure's own stepper can claim it from there).
 */
export async function assignEquipmentToStructureAction(
  userEquipmentId: string,
  structureId: string,
  desiredCount: number,
): Promise<SyncGrowingAreasResult> {
  const { userId, tenantId } = await requireSessionAndTenant();

  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ equipment: userEquipment, type: equipmentTypes })
      .from(userEquipment)
      .innerJoin(equipmentTypes, eq(userEquipment.equipmentTypeId, equipmentTypes.id))
      .where(and(eq(userEquipment.id, userEquipmentId), eq(userEquipment.userId, userId)));

    if (!row) return { ok: false, error: "Equipment not found" };

    const growingAreaType = SLUG_TO_GROWING_AREA_TYPE[row.type.slug];
    if (!growingAreaType) {
      return { ok: false, error: "This equipment type can't be used as growing space" };
    }

    const parentError = await validateStructureParent(tx, userId, structureId, growingAreaType);
    if (parentError) return { ok: false, error: parentError };

    const existing = await tx
      .select({ id: growingAreas.id, status: growingAreas.status, parentGrowingAreaId: growingAreas.parentGrowingAreaId })
      .from(growingAreas)
      .where(eq(growingAreas.sourceUserEquipmentId, userEquipmentId));

    const inThisStructure = existing.filter((r) => r.parentGrowingAreaId === structureId);
    // Every OTHER row — the main garden (unparented) or a different
    // structure — is already spoken for and off-limits to this action.
    const elsewhere = existing.filter((r) => r.parentGrowingAreaId !== structureId);

    const clamped = Math.max(0, Math.min(Math.trunc(desiredCount), row.equipment.quantity - elsewhere.length));

    if (inThisStructure.length < clamped) {
      const needed = clamped - inThisStructure.length;
      const newRows = buildGrowingAreaRows(
        {
          tenantId,
          userId,
          type: growingAreaType,
          sizeValue: row.equipment.sizeValue,
          sizeUnit: row.equipment.sizeUnit,
          widthCm: row.equipment.widthCm,
          lengthCm: row.equipment.lengthCm,
          depthCm: row.equipment.depthCm,
          heightCm: row.equipment.heightCm,
          sourceUserEquipmentId: userEquipmentId,
        },
        needed,
      ).map((r) => ({ ...r, parentGrowingAreaId: structureId }));
      await tx.insert(growingAreas).values(newRows);
    } else if (inThisStructure.length > clamped) {
      const removable = inThisStructure
        .filter((r) => r.status === "available")
        .slice(0, inThisStructure.length - clamped)
        .map((r) => r.id);
      if (removable.length > 0) {
        await tx
          .update(growingAreas)
          .set({ parentGrowingAreaId: null, positionXCm: null, positionYCm: null })
          .where(inArray(growingAreas.id, removable));
      }
    }

    const [{ value: finalCount }] = await tx
      .select({ value: count() })
      .from(growingAreas)
      .where(and(eq(growingAreas.sourceUserEquipmentId, userEquipmentId), eq(growingAreas.parentGrowingAreaId, structureId)));

    return { ok: true, count: finalCount };
  });
}
