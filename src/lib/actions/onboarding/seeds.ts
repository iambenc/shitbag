"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { seedInventory } from "@/db/schema";
import { requireSessionAndTenant } from "./shared";
import { nextOnboardingStep } from "@/lib/onboarding/steps";

const rowSchema = z.object({
  cropId: z.string().uuid(),
  quantityLabel: z.string().trim().min(1).max(100),
});

const rowsSchema = z.array(rowSchema).max(100);

export type SeedsState = { error?: string };

export async function saveSeedsAction(_prevState: SeedsState, formData: FormData): Promise<SeedsState> {
  let rows;
  try {
    rows = rowsSchema.parse(JSON.parse(String(formData.get("rows") ?? "[]")));
  } catch {
    return { error: "Something went wrong reading your seed list — please try again." };
  }

  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx.delete(seedInventory).where(eq(seedInventory.userId, userId));
    if (rows.length > 0) {
      await tx.insert(seedInventory).values(
        rows.map((r) => ({
          tenantId,
          userId,
          cropId: r.cropId,
          quantityLabel: r.quantityLabel,
          source: "onboarding" as const,
        })),
      );
    }
  });

  redirect(nextOnboardingStep("seeds"));
}
