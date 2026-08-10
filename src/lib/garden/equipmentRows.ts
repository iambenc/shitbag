import "server-only";
import { z } from "zod";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { userEquipment, equipmentTypes, growingAreas } from "@/db/schema";
import { SLUG_TO_GROWING_AREA_TYPE } from "@/lib/garden/equipmentMapping";
import { buildGrowingAreaRows } from "@/lib/garden/growingAreaSync";
import type { Database } from "@/db/client";

export const equipmentRowSchema = z.object({
  id: z.string().uuid(),
  equipmentTypeId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(999),
  sizeValue: z.coerce.number().positive().nullable().optional(),
  sizeUnit: z.enum(["cm", "litres"]).nullable().optional(),
  widthCm: z.coerce.number().positive().nullable().optional(),
  lengthCm: z.coerce.number().positive().nullable().optional(),
  depthCm: z.coerce.number().positive().nullable().optional(),
});

export const equipmentRowsSchema = z.array(equipmentRowSchema).max(200);

export type EquipmentRowInput = z.infer<typeof equipmentRowSchema>;

// Shared by the onboarding and /garden callers of EquipmentPicker — success
// is only ever set by the /garden caller (onboarding's action ends in
// redirect() and never returns normally), matching the ActionState shape
// already used by every admin form (src/lib/actions/admin.ts).
export type EquipmentState = { error?: string; success?: boolean };

/**
 * Syncs a user's full `userEquipment` set to exactly the submitted rows —
 * upserting by the client-generated row id rather than deleting and
 * reinserting everything, so rows the user didn't touch keep their real id.
 * That matters because `growingAreas.sourceUserEquipmentId` references this
 * id (ON DELETE SET NULL): a delete-all-reinsert-all approach would sever
 * every existing placement's link on every single edit, not just when
 * equipment is actually removed.
 *
 * Also auto-places growing-space equipment (pots/trays/planters/raised beds/
 * garden beds — anything in SLUG_TO_GROWING_AREA_TYPE) as usable growing
 * space, up to the owned quantity — "own it" and "it's ready to grow in"
 * used to be two separate steps (add it here, then manually place it via
 * /garden's steppers); this collapses them for the common case. Tools (e.g.
 * the watering can) have no entry in SLUG_TO_GROWING_AREA_TYPE and are
 * silently skipped, same convention already used in /garden/page.tsx's
 * `placeable` filter and generateGrowPlan.ts's `unplacedEquipment` filter.
 *
 * Auto-placement only ever fills the *increase in owned quantity within this
 * save*, diffed against each row's pre-save quantity — never a standing gap.
 * This matters because EquipmentPicker resubmits the entire row set on every
 * save, not a diff: naively backfilling "owned minus placed" on every save
 * would silently re-place equipment a user had deliberately reduced via the
 * steppers, on a save that never touched that row at all. A brand-new row
 * (no pre-save quantity) auto-places in full; an unchanged or decreased row
 * never auto-places, regardless of any standing owned-but-unplaced gap from
 * an earlier manual reduction or a prior quantity decrease (the latter is a
 * separate, already-known, deliberately deferred gap — not this function's
 * job to close).
 */
export async function applyEquipmentRows(
  tx: Database,
  { tenantId, userId, rows }: { tenantId: string; userId: string; rows: EquipmentRowInput[] },
): Promise<void> {
  const submittedIds = rows.map((r) => r.id);

  // Snapshot pre-save quantities before anything is mutated — see the
  // docblock above for why this (not the post-save owned quantity) is what
  // auto-placement below must diff against.
  const previousRows =
    submittedIds.length > 0
      ? await tx
          .select({ id: userEquipment.id, quantity: userEquipment.quantity })
          .from(userEquipment)
          .where(and(eq(userEquipment.userId, userId), inArray(userEquipment.id, submittedIds)))
      : [];
  const previousQuantityById = new Map(previousRows.map((r) => [r.id, r.quantity]));

  await tx
    .delete(userEquipment)
    .where(
      submittedIds.length > 0
        ? and(eq(userEquipment.userId, userId), notInArray(userEquipment.id, submittedIds))
        : eq(userEquipment.userId, userId),
    );

  if (rows.length === 0) return;

  await tx
    .insert(userEquipment)
    .values(
      rows.map((r) => ({
        id: r.id,
        tenantId,
        userId,
        equipmentTypeId: r.equipmentTypeId,
        quantity: r.quantity,
        sizeValue: r.sizeValue ?? null,
        sizeUnit: r.sizeUnit ?? null,
        widthCm: r.widthCm ?? null,
        lengthCm: r.lengthCm ?? null,
        depthCm: r.depthCm ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: userEquipment.id,
      set: {
        quantity: sql`excluded.quantity`,
        sizeValue: sql`excluded.size_value`,
        sizeUnit: sql`excluded.size_unit`,
        widthCm: sql`excluded.width_cm`,
        lengthCm: sql`excluded.length_cm`,
        depthCm: sql`excluded.depth_cm`,
      },
      // RLS only enforces tenant isolation, not per-user — without this, a
      // same-tenant user could submit another user's real userEquipment.id
      // as a "new" row and silently overwrite it via the upsert. The delete
      // above already scopes by userId; this closes the same gap on insert.
      setWhere: eq(userEquipment.userId, userId),
    });

  const typeIds = [...new Set(rows.map((r) => r.equipmentTypeId))];
  const types = await tx
    .select({ id: equipmentTypes.id, slug: equipmentTypes.slug })
    .from(equipmentTypes)
    .where(inArray(equipmentTypes.id, typeIds));
  const slugById = new Map(types.map((t) => [t.id, t.slug]));

  const growingSpaceRows = rows
    .map((r) => ({ row: r, growingAreaType: SLUG_TO_GROWING_AREA_TYPE[slugById.get(r.equipmentTypeId) ?? ""] }))
    .filter((x): x is { row: EquipmentRowInput; growingAreaType: (typeof SLUG_TO_GROWING_AREA_TYPE)[string] } =>
      Boolean(x.growingAreaType),
    );

  if (growingSpaceRows.length === 0) return;

  const existingAreas = await tx
    .select({ sourceUserEquipmentId: growingAreas.sourceUserEquipmentId })
    .from(growingAreas)
    .where(inArray(growingAreas.sourceUserEquipmentId, growingSpaceRows.map(({ row }) => row.id)));
  const existingCountById = new Map<string, number>();
  for (const a of existingAreas) {
    if (!a.sourceUserEquipmentId) continue;
    existingCountById.set(a.sourceUserEquipmentId, (existingCountById.get(a.sourceUserEquipmentId) ?? 0) + 1);
  }

  const newAreaRows = growingSpaceRows.flatMap(({ row, growingAreaType }) => {
    const previousQuantity = previousQuantityById.get(row.id) ?? 0;
    const increase = Math.max(0, row.quantity - previousQuantity);
    const existingPlaced = existingCountById.get(row.id) ?? 0;
    const insertCount = Math.max(0, Math.min(increase, row.quantity - existingPlaced));
    return buildGrowingAreaRows(
      {
        tenantId,
        userId,
        type: growingAreaType,
        sizeValue: row.sizeValue ?? null,
        sizeUnit: row.sizeUnit ?? null,
        widthCm: row.widthCm ?? null,
        lengthCm: row.lengthCm ?? null,
        depthCm: row.depthCm ?? null,
        sourceUserEquipmentId: row.id,
      },
      insertCount,
    );
  });

  if (newAreaRows.length > 0) {
    await tx.insert(growingAreas).values(newAreaRows);
  }
}
