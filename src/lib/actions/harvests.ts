"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { harvestLog, cropVarieties, crops, photoJournalEntries, photoVisibilityEnum, userProfiles } from "@/db/schema";
import type { PhotoVisibility } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { getPhotoStorage, ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES } from "@/lib/storage";
import { harvestSummaryLabel } from "@/lib/harvest/labels";

const addHarvestSchema = z.object({
  cropId: z.string().uuid(),
  // Optional, picked from a dependent dropdown (see HarvestsView.tsx) — user-
  // selected only, never AI-resolved here, unlike /seeds' free-text variety
  // field.
  varietyId: z.string().uuid().optional(),
  quantity: z.coerce.number().positive().max(100000),
  unit: z.string().trim().min(1).max(30),
  harvestedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  notes: z.string().trim().max(2000).optional(),
});

export type CreatedHarvest = {
  id: string;
  cropId: string;
  varietyId: string | null;
  quantity: number;
  unit: string;
  harvestedAt: string;
  notes: string | null;
  photoId: string | null;
  photoUrl: string | null;
  photoVisibility: PhotoVisibility | null;
};

export type AddHarvestState = { error?: string; harvest?: CreatedHarvest };

export async function addHarvestAction(
  _prevState: AddHarvestState,
  formData: FormData,
): Promise<AddHarvestState> {
  const parsed = addHarvestSchema.safeParse({
    cropId: formData.get("cropId"),
    varietyId: formData.get("varietyId") || undefined,
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
    harvestedAt: formData.get("harvestedAt"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  }

  // Confirm the submitted variety actually belongs to the submitted crop —
  // a mismatched pair (e.g. a stale dropdown after switching crops) would
  // otherwise silently attach an unrelated crop's variety. Silently dropped
  // (not an error) if it doesn't match, same silent-drop-on-invalid-
  // reference convention used throughout this app.
  let varietyId: string | null = null;
  if (parsed.data.varietyId) {
    const [variety] = await db
      .select({ id: cropVarieties.id })
      .from(cropVarieties)
      .where(and(eq(cropVarieties.id, parsed.data.varietyId), eq(cropVarieties.cropId, parsed.data.cropId)));
    varietyId = variety?.id ?? null;
  }

  // Photo is entirely optional — a plain harvest log entry with no photo is
  // still the common/default case, unchanged from before this feature.
  // Validated the same way every other upload action in this app validates
  // a file (ALLOWED_IMAGE_TYPES/MAX_PHOTO_BYTES), but a bad/missing photo
  // never blocks logging the harvest itself — it just silently skips the
  // photo half, same "don't let a secondary concern fail the primary one"
  // shape as uploadAndDiagnoseAction's task-completion step.
  const photoFile = formData.get("photo");
  const hasPhoto = photoFile instanceof File && photoFile.size > 0;
  let photoBuffer: Buffer | null = null;
  let photoContentType: string | null = null;
  let photoExtension: string | null = null;
  if (hasPhoto && photoFile.size <= MAX_PHOTO_BYTES) {
    const extension = ALLOWED_IMAGE_TYPES[photoFile.type];
    if (extension) {
      photoBuffer = Buffer.from(await photoFile.arrayBuffer());
      photoContentType = photoFile.type;
      photoExtension = extension;
    }
  }
  const visibilityParsed = z.enum(photoVisibilityEnum).safeParse(formData.get("visibility") || "private");
  const photoVisibility = visibilityParsed.success ? visibilityParsed.data : "private";

  const { userId, tenantId } = await requireSessionAndTenant();

  const [crop] = await db.select({ name: crops.name }).from(crops).where(eq(crops.id, parsed.data.cropId));
  const varietyName = varietyId
    ? (await db.select({ name: cropVarieties.name }).from(cropVarieties).where(eq(cropVarieties.id, varietyId)))[0]
        ?.name
    : null;

  let photoUploadResult: { key: string; url: string } | null = null;
  if (photoBuffer && photoContentType && photoExtension) {
    const storage = await getPhotoStorage();
    photoUploadResult = await storage.upload({
      tenantId,
      userId,
      buffer: photoBuffer,
      contentType: photoContentType,
      extension: photoExtension,
    });
  }

  const { harvest, photo } = await withTenant(tenantId, async (tx) => {
    const [harvestRow] = await tx
      .insert(harvestLog)
      .values({
        tenantId,
        userId,
        cropId: parsed.data.cropId,
        varietyId,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        harvestedAt: parsed.data.harvestedAt,
        notes: parsed.data.notes ?? null,
      })
      .returning();

    let photoRow = null;
    if (photoUploadResult && crop) {
      const caption = harvestSummaryLabel({
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        cropName: crop.name,
        varietyName,
      });
      [photoRow] = await tx
        .insert(photoJournalEntries)
        .values({
          tenantId,
          userId,
          storageKey: photoUploadResult.key,
          url: photoUploadResult.url,
          caption,
          visibility: photoVisibility,
          harvestLogId: harvestRow.id,
        })
        .returning();
    }

    return { harvest: harvestRow, photo: photoRow };
  });

  return {
    harvest: {
      id: harvest.id,
      cropId: harvest.cropId,
      varietyId: harvest.varietyId,
      quantity: harvest.quantity,
      unit: harvest.unit,
      harvestedAt: harvest.harvestedAt,
      notes: harvest.notes,
      photoId: photo?.id ?? null,
      photoUrl: photo?.url ?? null,
      photoVisibility: photo?.visibility ?? null,
    },
  };
}

export async function deleteHarvestAction(harvestId: string): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx.delete(harvestLog).where(and(eq(harvestLog.id, harvestId), eq(harvestLog.userId, userId)));
  });
}

// Sole consent toggle for getCommunityCropPopularity (src/lib/growPlan/
// communityPopularity.ts) — off by default, opt-in only.
export async function setShareHarvestDataAction(share: boolean): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx.update(userProfiles).set({ shareHarvestDataForCommunity: share }).where(eq(userProfiles.userId, userId));
  });
}
