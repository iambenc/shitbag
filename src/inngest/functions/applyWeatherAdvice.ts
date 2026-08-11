import { eq, and, inArray } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { userProfiles, tasks } from "@/db/schema";
import { getWeeklyForecast, type WeatherScenario } from "@/lib/weather";
import { assessWeather } from "@/lib/ai/agents/weatherAdvisor";
import { todayIso, addDaysIso } from "@/lib/dates";

type EventData = { userId: string; tenantId: string; weatherScenario?: WeatherScenario };

/**
 * One user's daily weather-advice run — fanned out as an individual event
 * per eligible user from dailyJobsFn's cron step, rather than looping AI
 * calls inside that single step.run(). Each user gets its own Inngest step
 * memoization/retry, matching every other agent-calling function in this
 * codebase (diagnosePlantFn, regenerateRecommendationFn); a step wrapping
 * one LLM call per invocation, not N calls for N users serialized inside
 * one un-resumable unit that would re-call the provider for already-
 * succeeded users on any retry.
 */
export const applyWeatherAdviceFn = inngest.createFunction(
  { id: "apply-weather-advice", retries: 2, triggers: [{ event: "weather-advice/requested" }] },
  async ({ event, step }) => {
    const { userId, tenantId, weatherScenario } = event.data as EventData;

    const context = await step.run("gather-context", async () => {
      return withTenant(tenantId, async (tx) => {
        const [profile] = await tx.select().from(userProfiles).where(eq(userProfiles.userId, userId));
        return {
          latitude: profile?.latitude ?? null,
          longitude: profile?.longitude ?? null,
          expertiseLevel: profile?.expertiseLevel ?? null,
        };
      });
    });

    if (context.latitude == null || context.longitude == null) return;

    try {
      const suggestions = await step.run("call-agent", async () => {
        const weeklyForecast = await getWeeklyForecast(context.latitude!, context.longitude!, weatherScenario);
        if (!weeklyForecast) return null;
        const result = await assessWeather(tenantId, { weeklyForecast, expertiseLevel: context.expertiseLevel });
        return result.output.suggestions;
      });

      if (suggestions === null) return;

      await step.run("persist-results", async () => {
        await withTenant(tenantId, async (tx) => {
          const today = todayIso();
          const tomorrow = addDaysIso(1);

          // Clean slate for today/tomorrow's weather tasks before inserting
          // this run's fresh suggestions — same cleanup the deterministic
          // rule this replaces already did on a rainy-day reversal, now
          // applied unconditionally so stale/contradictory weather tasks
          // from a previous day's forecast never linger.
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
        });
      });
    } catch (err) {
      // No dedicated status row for a background advice run (nothing
      // user-facing polls this) — Inngest's own retry (retries: 2 above)
      // already gives resilience; just log so a persistent failure is
      // visible in the dev server / Inngest dashboard.
      console.error(`[apply-weather-advice] failed for user ${userId}:`, err);
      throw err;
    }
  },
);
