"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, and, desc, gte, count } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { growPlans, growingAreas, planRecommendations } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { inngest } from "@/inngest/client";
import { startOfTodayLocal } from "@/lib/dates";
import { MAX_DAILY_GROW_PLAN_GENERATIONS } from "@/lib/ai/limits";

// Counts all growPlans rows regardless of status — the row is inserted (and
// the Inngest job dispatched) before success/failure is known, so a retry
// after a failure still consumes a slot. Shared between the action's
// backstop and the page's displayed "N left today" so they can't drift.
export async function getGrowPlanGenerationsToday(tenantId: string, userId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ count: count() })
      .from(growPlans)
      .where(and(eq(growPlans.userId, userId), gte(growPlans.createdAt, startOfTodayLocal())));
    return row.count;
  });
}

export async function generateGrowPlanAction(wantsUnusualCrop: boolean = false): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();

  const subscription = await getSubscription(userId, tenantId);
  if (!isPaidTier(subscription)) {
    redirect("/upgrade");
  }

  // Defensive backstop — /grow-plan already hides the generate/regenerate
  // button when this is true, but a server action must never trust the UI
  // alone. Any status counts: regenerating frees in_use areas automatically
  // (see generateGrowPlan.ts's free-previous-growing-areas step), so only
  // true zero should block.
  const hasGrowingArea = await withTenant(tenantId, async (tx) => {
    const [existingArea] = await tx
      .select({ id: growingAreas.id })
      .from(growingAreas)
      .where(eq(growingAreas.userId, userId))
      .limit(1);
    return Boolean(existingArea);
  });
  if (!hasGrowingArea) {
    redirect("/garden");
  }

  // Defensive backstop — /grow-plan hides "Generate a new plan" under the
  // same condition. A full regeneration frees every claimed area
  // unconditionally; if a per-recommendation reject is between gathering
  // its (still-claimed) area and persisting its replacement, a full
  // regeneration racing in could hand that same area to a brand-new
  // recommendation first, then the reject's replacement would claim it too
  // — violating the "an area is never claimed twice" invariant.
  const hasRegeneratingRecommendation = await withTenant(tenantId, async (tx) => {
    const [latestPlan] = await tx
      .select({ id: growPlans.id })
      .from(growPlans)
      .where(eq(growPlans.userId, userId))
      .orderBy(desc(growPlans.createdAt))
      .limit(1);
    if (!latestPlan) return false;

    const [row] = await tx
      .select({ id: planRecommendations.id })
      .from(planRecommendations)
      .where(and(eq(planRecommendations.growPlanId, latestPlan.id), eq(planRecommendations.status, "regenerating")))
      .limit(1);
    return Boolean(row);
  });
  if (hasRegeneratingRecommendation) {
    redirect("/grow-plan");
  }

  // Defensive backstop — /grow-plan hides every generate/try-again button
  // once the daily count is exhausted, but a server action must never trust
  // the UI alone (see getGrowPlanGenerationsToday's own comment on why all
  // statuses count).
  const generationsToday = await getGrowPlanGenerationsToday(tenantId, userId);
  if (generationsToday >= MAX_DAILY_GROW_PLAN_GENERATIONS) {
    redirect("/grow-plan");
  }

  const growPlan = await withTenant(tenantId, async (tx) => {
    const [row] = await tx.insert(growPlans).values({ tenantId, userId, status: "pending" }).returning();
    return row;
  });

  await inngest.send({
    name: "grow-plan/requested",
    data: { growPlanId: growPlan.id, tenantId, userId, wantsUnusualCrop },
  });

  revalidatePath("/", "layout");
  redirect("/grow-plan");
}
