"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { userProfiles, plotSizeEnum } from "@/db/schema";
import { requireSessionAndTenant } from "./shared";
import { nextOnboardingStep } from "@/lib/onboarding/steps";

const plotSchema = z.object({
  plotSize: z.enum(plotSizeEnum),
  avgSunlightHours: z.coerce.number().min(0).max(24),
  householdSize: z.coerce.number().int().min(1).max(20),
  hasIndoorSeedlingSpace: z.coerce.boolean(),
});

export type PlotState = { error?: string };

export async function savePlotAction(_prevState: PlotState, formData: FormData): Promise<PlotState> {
  const parsed = plotSchema.safeParse({
    plotSize: formData.get("plotSize"),
    avgSunlightHours: formData.get("avgSunlightHours"),
    householdSize: formData.get("householdSize"),
    hasIndoorSeedlingSpace: formData.get("hasIndoorSeedlingSpace") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  }

  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(userProfiles)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
  });

  redirect(nextOnboardingStep("plot"));
}
