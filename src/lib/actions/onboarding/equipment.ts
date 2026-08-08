"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { userEquipment } from "@/db/schema";
import { requireSessionAndTenant } from "./shared";
import { nextOnboardingStep } from "@/lib/onboarding/steps";

const rowSchema = z.object({
  equipmentTypeId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(999),
  sizeLabel: z.string().trim().min(1).max(100).nullable().optional(),
  widthCm: z.coerce.number().positive().nullable().optional(),
  lengthCm: z.coerce.number().positive().nullable().optional(),
  depthCm: z.coerce.number().positive().nullable().optional(),
});

const rowsSchema = z.array(rowSchema).max(200);

export type EquipmentState = { error?: string };

export async function saveEquipmentAction(
  _prevState: EquipmentState,
  formData: FormData,
): Promise<EquipmentState> {
  let rows;
  try {
    rows = rowsSchema.parse(JSON.parse(String(formData.get("rows") ?? "[]")));
  } catch {
    return { error: "Something went wrong reading your equipment list — please try again." };
  }

  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx.delete(userEquipment).where(eq(userEquipment.userId, userId));
    if (rows.length > 0) {
      await tx.insert(userEquipment).values(
        rows.map((r) => ({
          tenantId,
          userId,
          equipmentTypeId: r.equipmentTypeId,
          quantity: r.quantity,
          sizeLabel: r.sizeLabel ?? null,
          widthCm: r.widthCm ?? null,
          lengthCm: r.lengthCm ?? null,
          depthCm: r.depthCm ?? null,
        })),
      );
    }
  });

  redirect(nextOnboardingStep("equipment"));
}
