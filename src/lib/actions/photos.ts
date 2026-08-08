"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { photoJournalEntries, photoVisibilityEnum } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { getPhotoStorage, ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES } from "@/lib/storage";

const visibilitySchema = z.enum(photoVisibilityEnum);

export type UploadedPhoto = {
  id: string;
  url: string;
  caption: string | null;
  visibility: "private" | "shared_tenant";
};

export type UploadPhotoState = { error?: string; photo?: UploadedPhoto };

export async function uploadPhotoAction(
  _prevState: UploadPhotoState,
  formData: FormData,
): Promise<UploadPhotoState> {
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

  const visibilityParsed = visibilitySchema.safeParse(formData.get("visibility") || "private");
  const visibility = visibilityParsed.success ? visibilityParsed.data : "private";
  const caption = String(formData.get("caption") || "").trim().slice(0, 500) || null;

  const { userId, tenantId } = await requireSessionAndTenant();
  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = await getPhotoStorage();
  const { key, url } = await storage.upload({
    tenantId,
    userId,
    buffer,
    contentType: file.type,
    extension,
  });

  const photo = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(photoJournalEntries)
      .values({ tenantId, userId, storageKey: key, url, caption, visibility })
      .returning();
    return row;
  });

  return { photo: { id: photo.id, url: photo.url, caption: photo.caption, visibility: photo.visibility } };
}

export async function setPhotoVisibilityAction(
  photoId: string,
  visibility: "private" | "shared_tenant",
): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(photoJournalEntries)
      .set({ visibility })
      .where(and(eq(photoJournalEntries.id, photoId), eq(photoJournalEntries.userId, userId)));
  });
}

export async function deletePhotoAction(photoId: string): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();

  // Delete the DB row first and only remove the underlying file once that's
  // committed — a storage side-effect inside the transaction would leave an
  // orphaned-but-unrecoverable file if the transaction ever rolled back.
  const deleted = await withTenant(tenantId, async (tx) => {
    const [photo] = await tx
      .delete(photoJournalEntries)
      .where(and(eq(photoJournalEntries.id, photoId), eq(photoJournalEntries.userId, userId)))
      .returning({ storageKey: photoJournalEntries.storageKey });
    return photo;
  });

  if (deleted) {
    const storage = await getPhotoStorage();
    await storage.delete(deleted.storageKey);
  }
}
