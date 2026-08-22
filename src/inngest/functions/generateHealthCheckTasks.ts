import { eq, and, inArray } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { tenants, userProfiles, subscriptions, growingAreas, planRecommendationStages, planRecommendations, tasks } from "@/db/schema";
import { todayIso, addDaysIso } from "@/lib/dates";
import { growingAreaBaseLabel } from "@/lib/garden/labels";

type DevRunJobsEvent = { name: "dev/run-jobs"; data?: { job?: "daily" | "weekly" | "health-check" } };

/**
 * Runs weekly (Sundays 06:00): for every paid+active user, ensures each
 * OCCUPIED growing area (one with an active stage of a non-rejected
 * recommendation — same "what's growing where" criteria already used by
 * myGarden.ts/health.ts) has exactly one live "take a photo for a health
 * check" task. Paid-only — matches every other AI-costing feature in this
 * app (the resulting photo feeds the existing plant-health diagnosis
 * pipeline, a membership feature). An empty pot/bed has nothing to
 * photograph a health check of, so it gets no task.
 *
 * "Replace, not stack": any still-pending/missed health-check task from a
 * prior week is deleted before (maybe) inserting a fresh one — for EVERY
 * one of the user's areas, not just occupied ones, so a task left over from
 * an area that's since been harvested/emptied doesn't linger forever once
 * it stops being occupied.
 */
export const generateHealthCheckTasksFn = inngest.createFunction(
  { id: "generate-health-check-tasks", triggers: [{ cron: "0 6 * * 0" }, { event: "dev/run-jobs" }] },
  async ({ event, step }) => {
    const devEvent = event as DevRunJobsEvent;
    if (devEvent?.name === "dev/run-jobs" && devEvent.data?.job !== "health-check") return;

    await step.run("generate-health-check-tasks", async () => {
      const allTenants = await db.select().from(tenants);
      // The real cron always fires Sunday 06:00, so `today` is already
      // Sunday on that path — but the same function also runs off the
      // `dev/run-jobs` event for local testing/demoing, which can be fired
      // on any day. Always landing on the upcoming Sunday (today itself if
      // today already is one) keeps the generated task's due date correct
      // regardless of which day actually triggered the run.
      const day = new Date().getDay();
      const dueDate = day === 0 ? todayIso() : addDaysIso(7 - day);

      for (const tenant of allTenants) {
        await withTenant(tenant.id, async (tx) => {
          const rows = await tx
            .select({ userId: userProfiles.userId, subscription: subscriptions })
            .from(userProfiles)
            .innerJoin(subscriptions, eq(subscriptions.userId, userProfiles.userId));

          const eligibleUserIds = rows
            .filter((row) => row.subscription.tier === "paid" && row.subscription.status === "active")
            .map((row) => row.userId);
          if (eligibleUserIds.length === 0) return;

          const areas = await tx
            .select()
            .from(growingAreas)
            .where(inArray(growingAreas.userId, eligibleUserIds));
          if (areas.length === 0) return;
          const areaIds = areas.map((a) => a.id);

          const occupiedRows = await tx
            .select({ areaId: planRecommendationStages.growingAreaId })
            .from(planRecommendationStages)
            .innerJoin(planRecommendations, eq(planRecommendationStages.planRecommendationId, planRecommendations.id))
            .where(
              and(
                inArray(planRecommendationStages.growingAreaId, areaIds),
                eq(planRecommendationStages.status, "active"),
                inArray(planRecommendations.status, ["pending", "accepted", "regenerating"]),
              ),
            );
          const occupiedAreaIds = new Set(occupiedRows.map((r) => r.areaId));

          for (const area of areas) {
            await tx
              .delete(tasks)
              .where(
                and(
                  eq(tasks.growingAreaId, area.id),
                  eq(tasks.userId, area.userId),
                  inArray(tasks.status, ["pending", "missed"]),
                ),
              );

            if (!occupiedAreaIds.has(area.id)) continue;

            await tx.insert(tasks).values({
              tenantId: tenant.id,
              userId: area.userId,
              title: `Take a photo of ${growingAreaBaseLabel(area)} for a health check`,
              dueDate,
              source: "ai",
              growingAreaId: area.id,
            });
          }
        });
      }
    });
  },
);
