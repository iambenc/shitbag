"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { harvestLog } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";

const addHarvestSchema = z.object({
  cropId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(100000),
  unit: z.string().trim().min(1).max(30),
  harvestedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  notes: z.string().trim().max(2000).optional(),
});

export type CreatedHarvest = {
  id: string;
  cropId: string;
  quantity: number;
  unit: string;
  harvestedAt: string;
  notes: string | null;
};

export type AddHarvestState = { error?: string; harvest?: CreatedHarvest };

export async function addHarvestAction(
  _prevState: AddHarvestState,
  formData: FormData,
): Promise<AddHarvestState> {
  const parsed = addHarvestSchema.safeParse({
    cropId: formData.get("cropId"),
    quantity: formData.get("quantity"),
    unit: formData.get("unit"),
    harvestedAt: formData.get("harvestedAt"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  }

  const { userId, tenantId } = await requireSessionAndTenant();
  const harvest = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(harvestLog)
      .values({
        tenantId,
        userId,
        cropId: parsed.data.cropId,
        quantity: parsed.data.quantity,
        unit: parsed.data.unit,
        harvestedAt: parsed.data.harvestedAt,
        notes: parsed.data.notes ?? null,
      })
      .returning();
    return row;
  });

  return {
    harvest: {
      id: harvest.id,
      cropId: harvest.cropId,
      quantity: harvest.quantity,
      unit: harvest.unit,
      harvestedAt: harvest.harvestedAt,
      notes: harvest.notes,
    },
  };
}

export async function deleteHarvestAction(harvestId: string): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx.delete(harvestLog).where(and(eq(harvestLog.id, harvestId), eq(harvestLog.userId, userId)));
  });
}
