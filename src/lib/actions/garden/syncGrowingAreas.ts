"use server";

import { eq, and, inArray, count } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { userEquipment, equipmentTypes, growingAreas } from "@/db/schema";
import { SLUG_TO_GROWING_AREA_TYPE } from "@/lib/garden/equipmentMapping";

export type SyncGrowingAreasResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * Syncs the number of `growingAreas` rows sourced from a given `userEquipment`
 * row to `desiredCount` (clamped to [0, quantity owned]) — creating or
 * deleting individual rows as needed. Never trusts `desiredCount` blindly:
 * it's re-clamped server-side, and row removal prefers `available` rows over
 * `in_use` ones (nothing can be `in_use` yet in this phase, but the ordering
 * is already correct for when Planting exists and can set that status).
 */
export async function syncGrowingAreasAction(
  userEquipmentId: string,
  desiredCount: number,
): Promise<SyncGrowingAreasResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not authenticated" };
  const tenant = await getCurrentTenant();
  const userId = session.user.id;

  return withTenant(tenant.id, async (tx) => {
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

    const clamped = Math.max(0, Math.min(Math.trunc(desiredCount), row.equipment.quantity));

    const existing = await tx
      .select({ id: growingAreas.id, status: growingAreas.status })
      .from(growingAreas)
      .where(eq(growingAreas.sourceUserEquipmentId, userEquipmentId));

    if (existing.length < clamped) {
      const toAdd = clamped - existing.length;
      await tx.insert(growingAreas).values(
        Array.from({ length: toAdd }, () => ({
          tenantId: tenant.id,
          userId,
          type: growingAreaType,
          sizeLabel: row.equipment.sizeLabel,
          widthCm: row.equipment.widthCm,
          lengthCm: row.equipment.lengthCm,
          depthCm: row.equipment.depthCm,
          sourceUserEquipmentId: userEquipmentId,
        })),
      );
    } else if (existing.length > clamped) {
      const removable = existing
        .filter((r) => r.status === "available")
        .slice(0, existing.length - clamped)
        .map((r) => r.id);
      if (removable.length > 0) {
        await tx.delete(growingAreas).where(inArray(growingAreas.id, removable));
      }
    }

    const [{ value: finalCount }] = await tx
      .select({ value: count() })
      .from(growingAreas)
      .where(eq(growingAreas.sourceUserEquipmentId, userEquipmentId));

    return { ok: true, count: finalCount };
  });
}
