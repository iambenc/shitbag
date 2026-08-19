"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, lt } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { planRecommendations, growPlans, shoppingListItems } from "@/db/schema";
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
      .returning({
        id: planRecommendations.id,
        growPlanId: planRecommendations.growPlanId,
        cropId: planRecommendations.cropId,
        requiresPurchase: planRecommendations.requiresPurchase,
      });
  });
}

// The only point where a crop's seeds are allowed onto the shopping list —
// generateGrowPlan.ts/regenerateRecommendation.ts compute and persist each
// recommendation's requiresPurchase flag (AI guess OR a code-checked stock
// shortfall, unioned) but deliberately never add anything themselves, since
// a freshly generated/regenerated recommendation starts "pending" and may
// still be rejected outright. Accepting it here is the user's explicit
// signal that this suggestion is being kept, which is the only signal this
// app treats as "yes, go buy these seeds." weeklyShoppingList.ts's cron job
// is a backstop for this same rule (status = "accepted"), not a separate
// path — this is the primary one.
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

  const cropIdsNeedingPurchase = [...new Set(updated.filter((r) => r.requiresPurchase).map((r) => r.cropId))];
  if (cropIdsNeedingPurchase.length > 0) {
    await withTenant(tenantId, async (tx) => {
      const existingItems = await tx
        .select({ cropId: shoppingListItems.cropId })
        .from(shoppingListItems)
        .where(and(eq(shoppingListItems.userId, userId), inArray(shoppingListItems.cropId, cropIdsNeedingPurchase)));
      const alreadyListedCropIds = new Set(existingItems.map((i) => i.cropId));
      const newCropIds = cropIdsNeedingPurchase.filter((id) => !alreadyListedCropIds.has(id));
      if (newCropIds.length > 0) {
        await tx.insert(shoppingListItems).values(
          newCropIds.map((cropId) => ({
            tenantId,
            userId,
            cropId,
            quantityLabel: "1 packet",
            source: "ai" as const,
          })),
        );
      }
    });
    revalidatePath("/shopping-list");
  }

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
