"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { plantDiagnoses, photoJournalEntries, photoReports } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { getPhotoStorage, ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES } from "@/lib/storage";
import { inngest } from "@/inngest/client";

export type UploadAndDiagnoseState = { error?: string };

export async function uploadAndDiagnoseAction(
  _prevState: UploadAndDiagnoseState,
  formData: FormData,
): Promise<UploadAndDiagnoseState> {
  const { userId, tenantId } = await requireSessionAndTenant();

  const subscription = await getSubscription(userId, tenantId);
  if (!isPaidTier(subscription)) {
    redirect("/upgrade");
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: "That photo is too large (max 8MB)." };
  }
  const extension = ALLOWED_IMAGE_TYPES[file.type];
  if (!extension) {
    return { error: "Please upload a JPEG, PNG, WebP, or GIF image." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = await getPhotoStorage();
  const { key, url } = await storage.upload({
    tenantId,
    userId,
    buffer,
    contentType: file.type,
    extension,
  });

  const diagnosis = await withTenant(tenantId, async (tx) => {
    const [photo] = await tx
      .insert(photoJournalEntries)
      .values({ tenantId, userId, storageKey: key, url, visibility: "private" })
      .returning();
    const [row] = await tx
      .insert(plantDiagnoses)
      .values({ tenantId, userId, photoJournalEntryId: photo.id, status: "pending" })
      .returning();
    return row;
  });

  await inngest.send({
    name: "plant-diagnosis/requested",
    data: { diagnosisId: diagnosis.id, tenantId, userId },
  });

  revalidatePath("/", "layout");
  redirect("/plant-health");
}

export async function diagnoseExistingPhotoAction(photoJournalEntryId: string): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();

  const subscription = await getSubscription(userId, tenantId);
  if (!isPaidTier(subscription)) {
    redirect("/upgrade");
  }

  const diagnosis = await withTenant(tenantId, async (tx) => {
    const [photo] = await tx
      .select({ id: photoJournalEntries.id })
      .from(photoJournalEntries)
      .where(and(eq(photoJournalEntries.id, photoJournalEntryId), eq(photoJournalEntries.userId, userId)));
    if (!photo) return null;

    const [row] = await tx
      .insert(plantDiagnoses)
      .values({ tenantId, userId, photoJournalEntryId, status: "pending" })
      .returning();
    return row;
  });

  if (!diagnosis) return;

  await inngest.send({
    name: "plant-diagnosis/requested",
    data: { diagnosisId: diagnosis.id, tenantId, userId },
  });

  revalidatePath("/", "layout");
  redirect("/plant-health");
}

export async function reportPhotoAction(photoJournalEntryId: string, reason: string): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  const trimmedReason = reason.trim().slice(0, 500);
  if (!trimmedReason) return;

  await withTenant(tenantId, async (tx) => {
    const [photo] = await tx
      .select({ userId: photoJournalEntries.userId, visibility: photoJournalEntries.visibility })
      .from(photoJournalEntries)
      .where(eq(photoJournalEntries.id, photoJournalEntryId));

    if (!photo || photo.userId === userId || photo.visibility !== "shared_tenant") return;

    await tx.insert(photoReports).values({
      tenantId,
      photoJournalEntryId,
      reportedByUserId: userId,
      reason: trimmedReason,
    });
  });
}
