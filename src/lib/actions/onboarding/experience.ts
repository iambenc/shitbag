"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { userProfiles, expertiseLevelEnum } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";

const experienceSchema = z.object({
  expertiseLevel: z.enum(expertiseLevelEnum),
  weekdayHoursAvailable: z.coerce.number().min(0).max(24),
  weekendHoursAvailable: z.coerce.number().min(0).max(24),
});

export type ExperienceState = { error?: string };

export async function completeOnboardingAction(
  _prevState: ExperienceState,
  formData: FormData,
): Promise<ExperienceState> {
  const parsed = experienceSchema.safeParse({
    expertiseLevel: formData.get("expertiseLevel"),
    weekdayHoursAvailable: formData.get("weekdayHoursAvailable"),
    weekendHoursAvailable: formData.get("weekendHoursAvailable"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  }

  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(userProfiles)
      .set({ ...parsed.data, onboardingCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
  });

  redirect("/dashboard");
}
