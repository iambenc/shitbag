import { eq, and, inArray } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { tasks } from "@/db/schema";
import type { DailyForecast } from "@/lib/weather";
import { assessWeather } from "@/lib/ai/agents/weatherAdvisor";
import { todayIso, addDaysIso } from "@/lib/dates";

type EventData = {
  tenantId: string;
  userIds: string[];
  forecast: DailyForecast[];
  expertiseLevel: string | null;
  quotaPoolKey: string;
};

/**
 * One group's daily weather-advice run — a group is every user (within one
 * tenant) who shares an identical fetched forecast + expertise level, built
 * by dailyJobsFn's grouping step so a single Gemini call covers everyone in
 * it instead of one call per user (the dominant cost driver at scale — see
 * docs/plan.md). Forecast fetching now happens upstream in dailyJobsFn, not
 * here — this function only ever calls the AI agent and persists results.
 * throttle paces the group-level call rate itself (not per-user, since
 * groups are already the unit of AI spend); quotaPoolKey isolates a
 * tenant's own configured key from the shared platform key's bucket.
 */
export const applyWeatherAdviceFn = inngest.createFunction(
  {
    id: "apply-weather-advice",
    retries: 2,
    triggers: [{ event: "weather-advice/requested" }],
    throttle: { key: "event.data.quotaPoolKey", limit: 10, period: "1m" },
  },
  async ({ event, step }) => {
    const { tenantId, userIds, forecast, expertiseLevel } = event.data as EventData;

    let suggestions: { title: string; notes: string }[];
    try {
      suggestions = await step.run("call-agent", async () => {
        const result = await assessWeather(tenantId, { weeklyForecast: forecast, expertiseLevel });
        return result.output.suggestions;
      });
    } catch (err) {
      // No dedicated status row for a background advice run (nothing
      // user-facing polls this) — Inngest's own retry (retries: 2 above)
      // already gives resilience; just log so a persistent failure is
      // visible in the dev server / Inngest dashboard.
      console.error(`[apply-weather-advice] call-agent failed for tenant ${tenantId} group of ${userIds.length}:`, err);
      throw err;
    }

    await step.run("persist-results", async () => {
      const today = todayIso();
      const tomorrow = addDaysIso(1);
      const failures: string[] = [];

      await withTenant(tenantId, async (tx) => {
        // Per-user try/catch, not a bare loop over userIds — one user's DB
        // error must not skip persisting the rest of the group, since a
        // group can now be dozens/hundreds of users where previously each
        // had its own fully-isolated Inngest event and retry.
        for (const userId of userIds) {
          try {
            // Clean slate for today/tomorrow's weather tasks before
            // inserting this run's fresh suggestions — same cleanup the
            // deterministic rule this replaces already did on a rainy-day
            // reversal, now applied unconditionally so stale/contradictory
            // weather tasks from a previous day's forecast never linger.
            await tx
              .delete(tasks)
              .where(
                and(
                  eq(tasks.userId, userId),
                  eq(tasks.source, "weather"),
                  eq(tasks.status, "pending"),
                  inArray(tasks.dueDate, [today, tomorrow]),
                ),
              );

            if (suggestions.length > 0) {
              await tx.insert(tasks).values(
                suggestions.map((s) => ({
                  tenantId,
                  userId,
                  title: s.title,
                  notes: s.notes,
                  dueDate: today,
                  source: "weather" as const,
                })),
              );
            }
          } catch (err) {
            console.error(`[apply-weather-advice] persist failed for user ${userId}:`, err);
            failures.push(userId);
          }
        }
      });

      // Retrying the whole step (Inngest's built-in retries: 2) re-runs the
      // delete+insert for every user, including ones that already
      // succeeded — safe, since that pair is idempotent per user, and it's
      // the only way to get the failed users retried too.
      if (failures.length > 0) {
        throw new Error(`[apply-weather-advice] persist failed for ${failures.length}/${userIds.length} users: ${failures.join(", ")}`);
      }
    });
  },
);
