import { eq, and, lt, inArray, isNotNull } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { tenants, userProfiles, tasks, taskRescheduleEvents, subscriptions } from "@/db/schema";
import { getForecast, isHotAndDry, isRainy, type WeatherScenario } from "@/lib/weather";
import { todayIso, addDaysIso } from "@/lib/dates";

type DevRunJobsEvent = {
  name: "dev/run-jobs";
  data?: { job?: "daily" | "weekly"; weatherScenario?: WeatherScenario };
};

/**
 * Runs daily at 06:00: weather-driven watering tasks for paid users (spec:
 * a subscriber-only feature), then task slippage for every user (spec: a
 * general calendar mechanic, not tied to subscription tier). Iterates
 * tenants via the unscoped `tenants` table (not RLS-protected, same as
 * getCurrentTenant()) and does all per-tenant work through withTenant() —
 * no cross-tenant superuser bypass, the rule Phase 5 learned the hard way.
 */
export const dailyJobsFn = inngest.createFunction(
  { id: "daily-jobs", triggers: [{ cron: "0 6 * * *" }, { event: "dev/run-jobs" }] },
  async ({ event, step }) => {
    const devEvent = event as DevRunJobsEvent;
    if (devEvent?.name === "dev/run-jobs" && devEvent.data?.job !== "daily") return;
    const weatherScenario = devEvent?.name === "dev/run-jobs" ? devEvent.data?.weatherScenario : undefined;

    await step.run("weather-adjustment", async () => {
      const allTenants = await db.select().from(tenants);
      const today = todayIso();
      const tomorrow = addDaysIso(1);

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

            const forecast = await getForecast(
              row.profile.latitude!,
              row.profile.longitude!,
              weatherScenario,
            );
            if (!forecast) continue;

            if (isHotAndDry(forecast)) {
              const [existing] = await tx
                .select()
                .from(tasks)
                .where(
                  and(
                    eq(tasks.userId, row.profile.userId),
                    eq(tasks.source, "weather"),
                    eq(tasks.dueDate, today),
                  ),
                );
              if (!existing) {
                await tx.insert(tasks).values({
                  tenantId: tenant.id,
                  userId: row.profile.userId,
                  title: "Water your plants today",
                  notes: "Hot, dry weather is forecast — your plants will need extra water today.",
                  dueDate: today,
                  source: "weather",
                });
              }
            } else if (isRainy(forecast)) {
              await tx
                .delete(tasks)
                .where(
                  and(
                    eq(tasks.userId, row.profile.userId),
                    eq(tasks.source, "weather"),
                    eq(tasks.status, "pending"),
                    inArray(tasks.dueDate, [today, tomorrow]),
                  ),
                );
            }
          }
        });
      }
    });

    await step.run("task-slippage", async () => {
      const allTenants = await db.select().from(tenants);
      const today = todayIso();

      for (const tenant of allTenants) {
        await withTenant(tenant.id, async (tx) => {
          const overdue = await tx
            .select()
            .from(tasks)
            .where(and(eq(tasks.status, "pending"), lt(tasks.dueDate, today)));

          for (const task of overdue) {
            if (task.hardDeadlineDate && task.hardDeadlineDate < today) {
              await tx.update(tasks).set({ status: "missed" }).where(eq(tasks.id, task.id));
            } else {
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
