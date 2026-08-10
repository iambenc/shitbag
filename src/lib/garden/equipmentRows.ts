import "server-only";
import { z } from "zod";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { userEquipment } from "@/db/schema";
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
 */
export async function applyEquipmentRows(
  tx: Database,
  { tenantId, userId, rows }: { tenantId: string; userId: string; rows: EquipmentRowInput[] },
): Promise<void> {
  const submittedIds = rows.map((r) => r.id);

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
}
