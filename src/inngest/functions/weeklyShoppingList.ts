import { eq, and, asc } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { tenants, planRecommendations, growPlans, tasks, shoppingListItems } from "@/db/schema";
import { todayIso, addDaysIso } from "@/lib/dates";

type DevRunJobsEvent = { name: "dev/run-jobs"; data?: { job?: "daily" | "weekly" } };

/**
 * Runs weekly (Mondays 06:00): for every requiresPurchase recommendation
 * whose crop's earliest task falls within the next 14 days, add a shopping
 * list item if one doesn't already exist. Naturally paid-only — recommendations
 * only exist for users who've generated a grow plan, already gated in Phase 5 —
 * so no extra tier check is needed here.
 */
export const weeklyShoppingListFn = inngest.createFunction(
  { id: "weekly-shopping-list", triggers: [{ cron: "0 6 * * 1" }, { event: "dev/run-jobs" }] },
  async ({ event, step }) => {
    const devEvent = event as DevRunJobsEvent;
    if (devEvent?.name === "dev/run-jobs" && devEvent.data?.job !== "weekly") return;

    await step.run("generate-shopping-list", async () => {
      const allTenants = await db.select().from(tenants);
      const today = todayIso();
      const cutoff = addDaysIso(14);

      for (const tenant of allTenants) {
        await withTenant(tenant.id, async (tx) => {
          const recs = await tx
            .select({ recommendation: planRecommendations, growPlan: growPlans })
            .from(planRecommendations)
            .innerJoin(growPlans, eq(planRecommendations.growPlanId, growPlans.id))
            .where(eq(planRecommendations.requiresPurchase, true));

          for (const { recommendation, growPlan } of recs) {
            const [sowTask] = await tx
              .select()
              .from(tasks)
              .where(
                and(eq(tasks.userId, growPlan.userId), eq(tasks.cropId, recommendation.cropId)),
              )
              .orderBy(asc(tasks.dueDate))
              .limit(1);
            if (!sowTask) continue;
            if (sowTask.dueDate < today || sowTask.dueDate > cutoff) continue;

            const [existingItem] = await tx
              .select()
              .from(shoppingListItems)
              .where(
                and(
                  eq(shoppingListItems.userId, growPlan.userId),
                  eq(shoppingListItems.cropId, recommendation.cropId),
                ),
              );
            if (existingItem) continue;

            await tx.insert(shoppingListItems).values({
              tenantId: tenant.id,
              userId: growPlan.userId,
              cropId: recommendation.cropId,
              quantityLabel: "1 packet",
              source: "ai",
            });
          }
        });
      }
    });
  },
);
