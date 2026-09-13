import "server-only";
import { eq, and } from "drizzle-orm";
import { growingAreas } from "@/db/schema";
import type { GrowingAreaType } from "@/db/schema";
import type { Database } from "@/db/client";
import { CONTAINER_GROWING_AREA_TYPES } from "@/lib/garden/equipmentMapping";
import { HEIGHT_TYPES } from "@/lib/garden/layout";

/**
 * Shared by every action that places or assigns one growing area inside
 * another (saveGrowingAreaPositionAction/addGrowingAreaFromLayoutAction in
 * layout.ts, assignEquipmentToStructureAction in syncGrowingAreas.ts) — a
 * growing area can only be placed inside another when the parent is a real,
 * owned structure (HEIGHT_TYPES — the enclosed types with actual interior
 * space) and the child is a real, owned container type
 * (CONTAINER_GROWING_AREA_TYPES), never a structure nested inside a
 * structure. Re-validated server-side rather than trusted from the client,
 * same caution every other field in these actions already gets.
 */
export async function validateStructureParent(
  tx: Database,
  userId: string,
  parentGrowingAreaId: string,
  childType: GrowingAreaType,
): Promise<string | null> {
  if (!CONTAINER_GROWING_AREA_TYPES.includes(childType)) {
    return "Only pots, seed trays, grow bags, and planters can be placed inside a structure.";
  }
  const [parent] = await tx
    .select({ type: growingAreas.type })
    .from(growingAreas)
    .where(and(eq(growingAreas.id, parentGrowingAreaId), eq(growingAreas.userId, userId)));
  if (!parent) return "That structure wasn't found.";
  if (!HEIGHT_TYPES.includes(parent.type)) return "That growing area can't hold other areas inside it.";
  return null;
}
