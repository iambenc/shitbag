import "server-only";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PhotoStorage } from "./index";

const UPLOADS_ROOT = join(process.cwd(), "public", "uploads");

export const localPhotoStorage: PhotoStorage = {
  async upload({ tenantId, userId, buffer, extension }) {
    const dir = join(UPLOADS_ROOT, tenantId, userId);
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(dir, filename), buffer);
    const key = `${tenantId}/${userId}/${filename}`;
    return { key, url: `/uploads/${key}` };
  },
  async delete(key) {
    try {
      await unlink(join(UPLOADS_ROOT, key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  },
  async readBuffer(key) {
    return readFile(join(UPLOADS_ROOT, key));
  },
};
