import { eq, and, lte, isNotNull, inArray } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { tenants, userProfiles, tasks, taskRescheduleEvents, shoppingListItems, subscriptions, growingAreas } from "@/db/schema";
import type { WeatherScenario } from "@/lib/weather";
import { todayIso, addDaysIso, startOfMonthLocal } from "@/lib/dates";
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

    // A deliberately separate query from find-eligible-users above, not a
    // filter over its result — that list requires latitude/longitude
    // (needed for weather, irrelevant here), and coupling maintenance
    // eligibility to an invariant that has nothing to do with it would be a
    // fragile, easy-to-break dependency. Eligible = paid tier + at least
    // one growing area actually in_use (an available/reserved pot has
    // nothing growing in it yet to weed or mulch) + not already run this
    // calendar month (lastMaintenanceTasksGeneratedAt null, or before the
    // start of this month).
    const maintenanceEligibleUsers = await step.run("find-eligible-maintenance-users", async () => {
      const allTenants = await db.select().from(tenants);
      const users: { userId: string; tenantId: string }[] = [];
      const monthStart = startOfMonthLocal();

      for (const tenant of allTenants) {
        await withTenant(tenant.id, async (tx) => {
          const rows = await tx
            .select({ profile: userProfiles, subscription: subscriptions })
            .from(userProfiles)
            .innerJoin(subscriptions, eq(subscriptions.userId, userProfiles.userId));

          const paidAndDue = rows.filter((row) => {
            const paid = row.subscription.tier === "paid" && row.subscription.status === "active";
            if (!paid) return false;
            const last = row.profile.lastMaintenanceTasksGeneratedAt;
            return !last || last < monthStart;
          });
          if (paidAndDue.length === 0) return;

          const inUseAreas = await tx
            .select({ userId: growingAreas.userId })
            .from(growingAreas)
            .where(
              and(
                inArray(growingAreas.userId, paidAndDue.map((r) => r.profile.userId)),
                eq(growingAreas.status, "in_use"),
              ),
            );
          const usersWithGrowingSpace = new Set(inUseAreas.map((r) => r.userId));

          for (const row of paidAndDue) {
            if (usersWithGrowingSpace.has(row.profile.userId)) {
              users.push({ userId: row.profile.userId, tenantId: tenant.id });
            }
          }
        });
      }
      return users;
    });

    if (maintenanceEligibleUsers.length > 0) {
      await step.sendEvent(
        "notify-maintenance-tasks",
        maintenanceEligibleUsers.map((u) => ({
          name: "maintenance-tasks/requested" as const,
          data: { userId: u.userId, tenantId: u.tenantId },
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
