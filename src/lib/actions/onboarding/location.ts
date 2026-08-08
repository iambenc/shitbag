"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { userProfiles } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { nextOnboardingStep } from "@/lib/onboarding/steps";

const locationSchema = z.object({
  postcode: z.string().trim().min(1, "Enter a postcode"),
});

type PostcodesIoResponse = {
  status: number;
  result: { latitude: number; longitude: number; postcode: string } | null;
};

export type LocationState = { error?: string };

export async function saveLocationAction(
  _prevState: LocationState,
  formData: FormData,
): Promise<LocationState> {
  const parsed = locationSchema.safeParse({ postcode: formData.get("postcode") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter a postcode" };
  }

  const res = await fetch(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(parsed.data.postcode)}`,
  );
  const data = (await res.json()) as PostcodesIoResponse;
  if (data.status !== 200 || !data.result) {
    return { error: "We couldn't find that postcode — double check it and try again." };
  }

  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(userProfiles)
      .set({
        postcode: data.result!.postcode,
        latitude: data.result!.latitude,
        longitude: data.result!.longitude,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId));
  });

  redirect(nextOnboardingStep("location"));
}
