"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { gardenNotes, photoVisibilityEnum, growingAreas } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { growingAreaBaseLabel } from "@/lib/garden/labels";

const visibilitySchema = z.enum(photoVisibilityEnum);

export type CreatedNote = {
  id: string;
  body: string;
  visibility: "private" | "shared_tenant";
  tagLabel: string | null;
};

export type AddNoteState = { error?: string; note?: CreatedNote };

export async function addNoteAction(_prevState: AddNoteState, formData: FormData): Promise<AddNoteState> {
  const body = String(formData.get("body") || "").trim().slice(0, 2000);
  if (!body) {
    return { error: "Write a note first." };
  }

  const visibilityParsed = visibilitySchema.safeParse(formData.get("visibility") || "private");
  const visibility = visibilityParsed.success ? visibilityParsed.data : "private";

  const { userId, tenantId } = await requireSessionAndTenant();

  // Optional — re-validated against the user's own areas rather than
  // trusted blindly from the hidden/select field, same defensive pattern
  // uploadPhotoAction already uses for its own growingAreaId.
  const requestedGrowingAreaId = formData.get("growingAreaId");
  let growingAreaId: string | null = null;
  let tagLabel: string | null = null;
  if (typeof requestedGrowingAreaId === "string" && requestedGrowingAreaId) {
    const [area] = await withTenant(tenantId, async (tx) =>
      tx
        .select()
        .from(growingAreas)
        .where(and(eq(growingAreas.id, requestedGrowingAreaId), eq(growingAreas.userId, userId))),
    );
    if (area) {
      growingAreaId = area.id;
      tagLabel = growingAreaBaseLabel(area);
    }
  }

  const note = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(gardenNotes)
      .values({ tenantId, userId, body, visibility, growingAreaId })
      .returning();
    return row;
  });

  return { note: { id: note.id, body: note.body, visibility: note.visibility, tagLabel } };
}

export async function setNoteVisibilityAction(noteId: string, visibility: "private" | "shared_tenant"): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx.update(gardenNotes).set({ visibility }).where(and(eq(gardenNotes.id, noteId), eq(gardenNotes.userId, userId)));
  });
}

export async function deleteNoteAction(noteId: string): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx.delete(gardenNotes).where(and(eq(gardenNotes.id, noteId), eq(gardenNotes.userId, userId)));
  });
}
