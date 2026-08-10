"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, lt } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { planRecommendations, growPlans } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { inngest } from "@/inngest/client";
import { MAX_RECOMMENDATION_REGENERATIONS } from "@/lib/ai/limits";

// planRecommendations has no userId column — only reachable via
// growPlanId -> growPlans.userId — so ownership is verified by constraining
// the update to growPlanIds owned by this user, in the same atomic
// statement as the status flip itself (not a separate read-then-write,
// which would race with itself). inArray(status, [...]) doubles as an
// idempotency guard: a double-click reject on an already-regenerating or
// -rejected group touches zero rows. A row already at the retry cap is
// excluded from the WHERE (capReached) rather than checked separately.
// .returning() is authoritative — it silently drops any id the caller
// wasn't entitled to or that's ineligible, same tolerance as every other
// invalid-reference case in this codebase.
async function updateOwnedRecommendations(
  tenantId: string,
  userId: string,
  recommendationIds: string[],
  from: ("pending" | "accepted")[],
  to: "accepted" | "regenerating",
  enforceRetryCap: boolean,
) {
  return withTenant(tenantId, async (tx) => {
    const ownedGrowPlanIds = tx.select({ id: growPlans.id }).from(growPlans).where(eq(growPlans.userId, userId));
    return tx
      .update(planRecommendations)
      .set({ status: to })
      .where(
        and(
          inArray(planRecommendations.id, recommendationIds),
          inArray(planRecommendations.growPlanId, ownedGrowPlanIds),
          inArray(planRecommendations.status, from),
          enforceRetryCap ? lt(planRecommendations.regenerationCount, MAX_RECOMMENDATION_REGENERATIONS) : undefined,
        ),
      )
      .returning({ id: planRecommendations.id, growPlanId: planRecommendations.growPlanId });
  });
}

export async function acceptRecommendationAction(recommendationIds: string[]): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  const updated = await updateOwnedRecommendations(
    tenantId,
    userId,
    recommendationIds,
    ["pending", "accepted"],
    "accepted",
    false,
  );
  if (updated.length === 0) return;
  revalidatePath("/grow-plan");
}

export async function rejectRecommendationAction(recommendationIds: string[]): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  const updated = await updateOwnedRecommendations(
    tenantId,
    userId,
    recommendationIds,
    ["pending", "accepted"],
    "regenerating",
    true,
  );
  if (updated.length === 0) return;

  await inngest.send({
    name: "recommendation/rejected",
    data: {
      recommendationIds: updated.map((r) => r.id),
      growPlanId: updated[0].growPlanId,
      tenantId,
      userId,
    },
  });

  revalidatePath("/grow-plan");
}
