import { eq, and, lte, isNotNull, inArray } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { tenants, userProfiles, tasks, taskRescheduleEvents, shoppingListItems, subscriptions, growingAreas } from "@/db/schema";
import { getWeeklyForecast, type DailyForecast, type WeatherScenario } from "@/lib/weather";
import { getQuotaPoolKey } from "@/lib/ai/provider";
import { todayIso, addDaysIso, startOfMonthLocal } from "@/lib/dates";
import { getSeedStock } from "@/lib/seeds/stock";

type DevRunJobsEvent = {
  name: "dev/run-jobs";
  data?: { job?: "daily" | "weekly"; weatherScenario?: WeatherScenario };
};

// Inngest's exact per-call max batch size for step.sendEvent isn't publicly
// documented; chunking defensively at a conservative size means this never
// needs to find out the hard way at 1000-user scale.
const SEND_EVENT_CHUNK_SIZE = 250;
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// Rounds to ~2 decimal degrees (~1km grid) — coarse enough that neighbouring
// users in the same town collapse onto one Open-Meteo fetch, tight enough
// that the forecast is still genuinely representative of each user's actual
// location.
function roundLocation(value: number): number {
  return Math.round(value * 100) / 100;
}

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

    // Only *identifies* eligible users here — the forecast fetch and AI call
    // happen in the grouping step and applyWeatherAdviceFn below. Carries
    // latitude/longitude/expertiseLevel forward (already fetched in this
    // same query) so the next step doesn't need to re-query per user, plus
    // each tenant's quotaPoolKey (own configured Gemini key vs. the shared
    // platform key — see getQuotaPoolKey) so the eventual throttle bucket
    // isolates a tenant's own quota from everyone else's, computed once per
    // tenant here rather than once per user.
    const eligibleUsers = await step.run("find-eligible-users", async () => {
      const allTenants = await db.select().from(tenants);
      const users: {
        userId: string;
        tenantId: string;
        latitude: number;
        longitude: number;
        expertiseLevel: string | null;
        quotaPoolKey: string;
      }[] = [];

      for (const tenant of allTenants) {
        await withTenant(tenant.id, async (tx) => {
          const rows = await tx
            .select({ profile: userProfiles, subscription: subscriptions })
            .from(userProfiles)
            .innerJoin(subscriptions, eq(subscriptions.userId, userProfiles.userId))
            .where(and(isNotNull(userProfiles.latitude), isNotNull(userProfiles.longitude)));

          const eligibleRows = rows.filter(
            (row) => row.subscription.tier === "paid" && row.subscription.status === "active",
          );
          if (eligibleRows.length === 0) return;

          const quotaPoolKey = await getQuotaPoolKey(tx, tenant.id, "weather_advisor");
          for (const row of eligibleRows) {
            users.push({
              userId: row.profile.userId,
              tenantId: tenant.id,
              latitude: row.profile.latitude!,
              longitude: row.profile.longitude!,
              expertiseLevel: row.profile.expertiseLevel,
              quotaPoolKey,
            });
          }
        });
      }
      return users;
    });

    // Groups users so ONE Gemini call covers everyone who'd get identical
    // advice, instead of one call per user — the dominant cost driver at
    // scale (see docs/plan.md). Two passes: (1) bucket by rounded lat/long
    // and fetch ONE Open-Meteo forecast per bucket — bounds both the number
    // of outbound HTTP calls and, since this all runs inside one step.run(),
    // the risk of a step-execution timeout from fetching hundreds of
    // forecasts individually; fetches are sequential (not unbounded
    // Promise.all) since this step already isn't retried per-iteration risk
    // like an LLM call would be, but an unbounded fan-out of HTTP requests
    // is still worth avoiding. (2) group by the forecast's actual fetched
    // content + expertiseLevel + tenantId — never merged across tenants,
    // since tenants are isolated by design everywhere else in this app, and
    // two adjacent rounded buckets can still coincidentally fetch identical
    // forecast content, which this second pass also collapses.
    const weatherGroups = await step.run("group-weather-users-by-forecast", async () => {
      const forecastByBucket = new Map<string, DailyForecast[] | null>();
      const bucketKeys = new Map<string, string>(); // userId -> bucket key
      for (const u of eligibleUsers) {
        const bucketKey = `${roundLocation(u.latitude)},${roundLocation(u.longitude)}`;
        bucketKeys.set(u.userId, bucketKey);
        if (!forecastByBucket.has(bucketKey)) forecastByBucket.set(bucketKey, null);
      }
      for (const bucketKey of forecastByBucket.keys()) {
        const [lat, lon] = bucketKey.split(",").map(Number);
        const forecast = await getWeeklyForecast(lat, lon, weatherScenario);
        forecastByBucket.set(bucketKey, forecast);
      }

      type Group = {
        tenantId: string;
        userIds: string[];
        forecast: DailyForecast[];
        expertiseLevel: string | null;
        quotaPoolKey: string;
      };
      const groups = new Map<string, Group>();
      for (const u of eligibleUsers) {
        const forecast = forecastByBucket.get(bucketKeys.get(u.userId)!);
        if (!forecast) continue; // Open-Meteo failed for this bucket — same skip applyWeatherAdviceFn used to do per-user.
        const groupKey = `${u.tenantId}|${u.expertiseLevel}|${JSON.stringify(forecast)}`;
        const existing = groups.get(groupKey);
        if (existing) {
          existing.userIds.push(u.userId);
        } else {
          groups.set(groupKey, {
            tenantId: u.tenantId,
            userIds: [u.userId],
            forecast,
            expertiseLevel: u.expertiseLevel,
            quotaPoolKey: u.quotaPoolKey,
          });
        }
      }
      return [...groups.values()];
    });

    for (const [i, batch] of chunk(weatherGroups, SEND_EVENT_CHUNK_SIZE).entries()) {
      await step.sendEvent(
        `notify-weather-advice-${i}`,
        batch.map((g) => ({
          name: "weather-advice/requested" as const,
          data: {
            tenantId: g.tenantId,
            userIds: g.userIds,
            forecast: g.forecast,
            expertiseLevel: g.expertiseLevel,
            quotaPoolKey: g.quotaPoolKey,
          },
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
      const users: { userId: string; tenantId: string; quotaPoolKey: string }[] = [];
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

          const eligibleInTenant = paidAndDue.filter((row) => usersWithGrowingSpace.has(row.profile.userId));
          if (eligibleInTenant.length === 0) return;

          const quotaPoolKey = await getQuotaPoolKey(tx, tenant.id, "maintenance_tasks");
          for (const row of eligibleInTenant) {
            users.push({ userId: row.profile.userId, tenantId: tenant.id, quotaPoolKey });
          }
        });
      }
      return users;
    });

    for (const [i, batch] of chunk(maintenanceEligibleUsers, SEND_EVENT_CHUNK_SIZE).entries()) {
      await step.sendEvent(
        `notify-maintenance-tasks-${i}`,
        batch.map((u) => ({
          name: "maintenance-tasks/requested" as const,
          data: { userId: u.userId, tenantId: u.tenantId, quotaPoolKey: u.quotaPoolKey },
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
