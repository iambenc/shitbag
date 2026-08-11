"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, and, gte, count, isNull, inArray } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import {
  growingAreaEstimations,
  growingAreas,
  growingAreaTypeEnum,
  sizeUnitEnum,
  equipmentTypes,
  userEquipment,
} from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { getPhotoStorage, ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES } from "@/lib/storage";
import { inngest } from "@/inngest/client";
import { startOfTodayLocal } from "@/lib/dates";
import { MAX_DAILY_GROWING_AREA_ESTIMATIONS, MAX_ESTIMATION_PHOTOS } from "@/lib/ai/limits";
import { GROWING_AREA_TYPE_TO_SLUG } from "@/lib/garden/equipmentMapping";
import { buildGrowingAreaRows } from "@/lib/garden/growingAreaSync";
import { z } from "zod";

export type UploadPhotosForEstimationState = { error?: string };

// Counts all rows regardless of status (pending/complete/failed) — the slot
// is consumed at insert time, before the Inngest job even runs, so a failed
// run still uses up a slot for today. Same rule and rationale as
// getPlantDiagnosesToday.
export async function getGrowingAreaEstimationsToday(tenantId: string, userId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ count: count() })
      .from(growingAreaEstimations)
      .where(
        and(
          eq(growingAreaEstimations.userId, userId),
          gte(growingAreaEstimations.createdAt, startOfTodayLocal()),
        ),
      );
    return row.count;
  });
}

export async function uploadPhotosForEstimationAction(
  _prevState: UploadPhotosForEstimationState,
  formData: FormData,
): Promise<UploadPhotosForEstimationState> {
  const { userId, tenantId } = await requireSessionAndTenant();

  const subscription = await getSubscription(userId, tenantId);
  if (!isPaidTier(subscription)) {
    redirect("/upgrade");
  }

  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { error: "Choose at least one photo to upload." };
  }
  if (files.length > MAX_ESTIMATION_PHOTOS) {
    return { error: `Please upload at most ${MAX_ESTIMATION_PHOTOS} photos at a time.` };
  }
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) {
      return { error: "One of those photos is too large (max 8MB each)." };
    }
    if (!ALLOWED_IMAGE_TYPES[file.type]) {
      return { error: "Please upload JPEG, PNG, WebP, or GIF images." };
    }
  }

  // Checked before the (expensive) storage uploads — no point uploading N
  // photos for a run that's about to be blocked anyway.
  const estimationsToday = await getGrowingAreaEstimationsToday(tenantId, userId);
  if (estimationsToday >= MAX_DAILY_GROWING_AREA_ESTIMATIONS) {
    return {
      error: `You've used all ${MAX_DAILY_GROWING_AREA_ESTIMATIONS} photo estimates for today — come back tomorrow.`,
    };
  }

  const storage = await getPhotoStorage();
  const photoStorageKeys: string[] = [];
  const photoUrls: string[] = [];
  for (const file of files) {
    const extension = ALLOWED_IMAGE_TYPES[file.type];
    const buffer = Buffer.from(await file.arrayBuffer());
    const { key, url } = await storage.upload({ tenantId, userId, buffer, contentType: file.type, extension });
    photoStorageKeys.push(key);
    photoUrls.push(url);
  }

  const estimation = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(growingAreaEstimations)
      .values({ tenantId, userId, photoStorageKeys, photoUrls, status: "pending" })
      .returning();
    return row;
  });

  await inngest.send({
    name: "growing-area-estimation/requested",
    data: { estimationId: estimation.id, tenantId, userId },
  });

  revalidatePath("/garden/estimate");
  redirect(`/garden/estimate/${estimation.id}`);
}

const ConfirmedRowSchema = z.object({
  type: z.enum(growingAreaTypeEnum),
  sizeValue: z.number().positive().nullable(),
  sizeUnit: z.enum(sizeUnitEnum).nullable(),
  widthCm: z.number().positive().nullable(),
  lengthCm: z.number().positive().nullable(),
  depthCm: z.number().positive().nullable(),
});

export type ConfirmGrowingAreaProposalsState = { error?: string; success?: boolean };

// Rows are grouped by everything that has to match for them to be "the same
// equipment" (one userEquipment row + quantity, matching how EquipmentPicker
// already represents "3x 20cm pots" as one row, not three) — never by type
// alone, since two pots of different sizes are genuinely different owned
// items.
function equipmentGroupKey(row: z.infer<typeof ConfirmedRowSchema>): string {
  return [row.type, row.sizeValue, row.sizeUnit, row.widthCm, row.lengthCm, row.depthCm].join("|");
}

/**
 * Applies a user-reviewed (possibly edited/added/removed) set of proposed
 * areas — as real `userEquipment` (owned) rows, auto-placed as `growingAreas`
 * exactly like adding equipment through the picker already does (see
 * applyEquipmentRows.ts), not as orphaned growingAreas with no equipment
 * backing. Without this, a photo-confirmed pot would be usable growing space
 * but invisible in "Your equipment" — no owned-quantity tracking, no
 * steppers, none of the inventory model the rest of the app assumes every
 * growing area came from.
 *
 * Guarded by an atomic UPDATE ... WHERE status = 'complete' AND applied_at
 * IS NULL ... RETURNING, not a separate read-then-write — two tabs/a
 * double-click both reading appliedAt as null before either writes would
 * otherwise both pass and create duplicate equipment. The guarded update
 * runs first, inside the same transaction as the inserts, so a concurrent
 * second request's update matches zero rows and no-ops.
 */
export async function confirmGrowingAreaProposalsAction(
  estimationId: string,
  rows: unknown,
): Promise<ConfirmGrowingAreaProposalsState> {
  const { userId, tenantId } = await requireSessionAndTenant();

  const parsed = z.array(ConfirmedRowSchema).max(20).safeParse(rows);
  if (!parsed.success) {
    return { error: "That doesn't look like a valid set of growing areas." };
  }
  if (parsed.data.length === 0) {
    return { error: "Add at least one growing area before confirming." };
  }

  const groups = new Map<string, { row: z.infer<typeof ConfirmedRowSchema>; quantity: number }>();
  for (const row of parsed.data) {
    const key = equipmentGroupKey(row);
    const existing = groups.get(key);
    if (existing) existing.quantity += 1;
    else groups.set(key, { row, quantity: 1 });
  }

  const applied = await withTenant(tenantId, async (tx) => {
    const [claimed] = await tx
      .update(growingAreaEstimations)
      .set({ appliedAt: new Date() })
      .where(
        and(
          eq(growingAreaEstimations.id, estimationId),
          eq(growingAreaEstimations.userId, userId),
          eq(growingAreaEstimations.status, "complete"),
          isNull(growingAreaEstimations.appliedAt),
        ),
      )
      .returning({ id: growingAreaEstimations.id });
    // Atomic: a concurrent second request's identical UPDATE (double-click,
    // two tabs) runs against the same WHERE, but by the time it executes
    // appliedAt is already non-null, so it matches zero rows and no-ops —
    // not a separate read-then-write, which would let both requests pass.
    if (!claimed) return false;

    const neededSlugs = [...new Set([...groups.values()].map((g) => GROWING_AREA_TYPE_TO_SLUG[g.row.type]))];
    const types = await tx
      .select({ id: equipmentTypes.id, slug: equipmentTypes.slug })
      .from(equipmentTypes)
      .where(and(eq(equipmentTypes.tenantId, tenantId), inArray(equipmentTypes.slug, neededSlugs)));
    const equipmentTypeIdBySlug = new Map(types.map((t) => [t.slug, t.id]));

    const newGrowingAreaRows: ReturnType<typeof buildGrowingAreaRows>[number][] = [];
    for (const { row, quantity } of groups.values()) {
      const slug = GROWING_AREA_TYPE_TO_SLUG[row.type];
      const equipmentTypeId = equipmentTypeIdBySlug.get(slug);
      // Every growingAreaTypeEnum value has a seeded equipmentTypes row for
      // every tenant (seed.ts) — this should never actually miss, but if a
      // tenant's catalog was edited to remove one, silently drop that
      // group rather than fail the whole confirm, matching this codebase's
      // established silent-drop-on-ineligible convention (e.g. /garden's
      // own `placeable` filter).
      if (!equipmentTypeId) continue;

      const [equipmentRow] = await tx
        .insert(userEquipment)
        .values({
          tenantId,
          userId,
          equipmentTypeId,
          quantity,
          sizeValue: row.sizeValue,
          sizeUnit: row.sizeUnit,
          widthCm: row.widthCm,
          lengthCm: row.lengthCm,
          depthCm: row.depthCm,
        })
        .returning({ id: userEquipment.id });

      newGrowingAreaRows.push(
        ...buildGrowingAreaRows(
          {
            tenantId,
            userId,
            type: row.type,
            sizeValue: row.sizeValue,
            sizeUnit: row.sizeUnit,
            widthCm: row.widthCm,
            lengthCm: row.lengthCm,
            depthCm: row.depthCm,
            sourceUserEquipmentId: equipmentRow.id,
          },
          quantity,
        ),
      );
    }

    if (newGrowingAreaRows.length > 0) {
      await tx.insert(growingAreas).values(newGrowingAreaRows.map((row) => ({ ...row, status: "available" as const })));
    }
    return true;
  });

  if (!applied) {
    return { error: "This estimate has already been applied or isn't ready yet." };
  }

  revalidatePath("/garden");
  revalidatePath(`/garden/estimate/${estimationId}`);
  return { success: true };
}
