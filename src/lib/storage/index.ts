export type StoredFile = { key: string; url: string };

export interface PhotoStorage {
  upload(input: {
    tenantId: string;
    userId: string;
    buffer: Buffer;
    contentType: string;
    extension: string;
  }): Promise<StoredFile>;
  delete(key: string): Promise<void>;
}

/**
 * No R2 account is provisioned yet (same situation Postgres was in for Phase
 * 0 — Neon wasn't provisioned, so Docker Postgres stood in behind the same
 * DATABASE_URL shape). This resolves to the local-filesystem implementation
 * for now; swapping to R2 later is a new PhotoStorage implementation plus an
 * env var, not an app-code change.
 */
export async function getPhotoStorage(): Promise<PhotoStorage> {
  const { localPhotoStorage } = await import("./local");
  return localPhotoStorage;
}

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
