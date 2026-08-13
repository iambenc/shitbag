import { eq, and, lte, isNotNull } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { tenants, userProfiles, tasks, taskRescheduleEvents, shoppingListItems, subscriptions } from "@/db/schema";
import type { WeatherScenario } from "@/lib/weather";
import { todayIso, addDaysIso } from "@/lib/dates";
import { getSeedStock } from "@/lib/seeds/stock";

type DevRunJobsEvent = {
  name: "dev/run-jobs";
  data?: { job?: "daily" | "weekly"; weatherScenario?: WeatherScenario };
};

/**
 * Runs daily at 06:00: fans out one weather-advice event per eligible user
 * (spec: a subscriber-only feature), then task slippage for every user
 * (spec: a general calendar mechanic, not tied to subscription tier).
 * Iterates tenants via the unscoped `tenants` table (not RLS-protected,
 * same as getCurrentTenant()) and does all per-tenant work through
 * withTenant() — no cross-tenant superuser bypass, the rule Phase 5 learned
 * the hard way.
 */
export const dailyJobsFn = inngest.createFunction(
  { id: "daily-jobs", triggers: [{ cron: "0 6 * * *" }, { event: "dev/run-jobs" }] },
  async ({ event, step }) => {
    const devEvent = event as DevRunJobsEvent;
    if (devEvent?.name === "dev/run-jobs" && devEvent.data?.job !== "daily") return;
    const weatherScenario = devEvent?.name === "dev/run-jobs" ? devEvent.data?.weatherScenario : undefined;

    // Only *identifies* eligible users here — the actual forecast fetch and
    // AI call happen one-user-at-a-time in applyWeatherAdviceFn, fanned out
    // via events below. Deliberately not looping AI calls inside this single
    // step.run(): Inngest memoizes at the step boundary, not per-loop-
    // iteration, so a step wrapping N sequential LLM calls would re-call the
    // provider for every already-succeeded user on any retry of this step —
    // real cost/retry-amplification risk that a cheap DB-only loop never had.
    const eligibleUsers = await step.run("find-eligible-users", async () => {
      const allTenants = await db.select().from(tenants);
      const users: { userId: string; tenantId: string }[] = [];

      for (const tenant of allTenants) {
        await withTenant(tenant.id, async (tx) => {
          const rows = await tx
            .select({ profile: userProfiles, subscription: subscriptions })
            .from(userProfiles)
            .innerJoin(subscriptions, eq(subscriptions.userId, userProfiles.userId))
            .where(and(isNotNull(userProfiles.latitude), isNotNull(userProfiles.longitude)));

          for (const row of rows) {
            const paid = row.subscription.tier === "paid" && row.subscription.status === "active";
            if (!paid) continue;
            users.push({ userId: row.profile.userId, tenantId: tenant.id });
          }
        });
      }
      return users;
    });

    if (eligibleUsers.length > 0) {
      await step.sendEvent(
        "notify-weather-advice",
        eligibleUsers.map((u) => ({
          name: "weather-advice/requested" as const,
          data: { userId: u.userId, tenantId: u.tenantId, weatherScenario },
        })),
      );
    }

    // Broadened to dueDate <= today (not just strictly overdue) so a
    // seed-gated sow task is checked the moment it becomes due, not one day
    // late — a task due today that the user can't act on yet shouldn't sit
    // there implying it's actionable. Per task, in priority order: (a) a
    // passed hard deadline always wins and marks it missed, regardless of
    // seed stock — that's an absolute AI-set cutoff, not something seed
    // availability should override; (b) a seed-gated task due today or
    // overdue with known-insufficient stock gets pushed a full week forward
    // instead of today — not just one day, since seeds realistically take
    // longer than a day to arrive once ordered, and re-checking daily would
    // just be repeated no-op churn (a reschedule event logged every day for
    // no behavioral change) — so it never falsely reads as "due now," plus a
    // shopping-list nudge; unknown stock (onboarding-only rows with no
    // numeric count) is never treated as insufficient, matching
    // toggleTaskCompleteAction's own no-op-on-unknown-stock behavior; (c)
    // anything else strictly overdue gets the original generic slip-to-today
    // treatment. A task exactly due today that isn't seed-blocked hits none
    // of these branches, unchanged.
    await step.run("task-slippage", async () => {
      const allTenants = await db.select().from(tenants);
      const today = todayIso();
      const nextWeek = addDaysIso(7);

      for (const tenant of allTenants) {
        await withTenant(tenant.id, async (tx) => {
          const due = await tx
            .select()
            .from(tasks)
            .where(and(eq(tasks.status, "pending"), lte(tasks.dueDate, today)));

          for (const task of due) {
            const isOverdue = task.dueDate < today;

            if (isOverdue && task.hardDeadlineDate && task.hardDeadlineDate < today) {
              await tx.update(tasks).set({ status: "missed" }).where(eq(tasks.id, task.id));
              continue;
            }

            if (task.cropId && task.estimatedSeedsUsed) {
              const stock = await getSeedStock(tx, task.userId, task.cropId, task.varietyId);
              if (stock.known && stock.total < task.estimatedSeedsUsed) {
                await tx.insert(taskRescheduleEvents).values({
                  tenantId: tenant.id,
                  taskId: task.id,
                  oldDueDate: task.dueDate,
                  newDueDate: nextWeek,
                  reason: "seeds",
                });
                await tx.update(tasks).set({ dueDate: nextWeek }).where(eq(tasks.id, task.id));

                const [existingItem] = await tx
                  .select({ id: shoppingListItems.id })
                  .from(shoppingListItems)
                  .where(and(eq(shoppingListItems.userId, task.userId), eq(shoppingListItems.cropId, task.cropId)));
                if (!existingItem) {
                  await tx.insert(shoppingListItems).values({
                    tenantId: tenant.id,
                    userId: task.userId,
                    cropId: task.cropId,
                    quantityLabel: "1 packet",
                    source: "ai" as const,
                  });
                }
                continue;
              }
            }

            if (isOverdue) {
              await tx.insert(taskRescheduleEvents).values({
                tenantId: tenant.id,
                taskId: task.id,
                oldDueDate: task.dueDate,
                newDueDate: today,
                reason: "slipped",
              });
              await tx.update(tasks).set({ dueDate: today }).where(eq(tasks.id, task.id));
            }
          }
        });
      }
    });
  },
);
