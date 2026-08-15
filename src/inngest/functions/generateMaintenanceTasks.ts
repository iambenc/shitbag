import { eq, and, inArray } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { userProfiles, growingAreas, equipmentTypes, userEquipment, shoppingListItems, tasks } from "@/db/schema";
import { generateMaintenanceTasks } from "@/lib/ai/agents/maintenanceTasks";
import { SLUG_TO_GROWING_AREA_TYPE } from "@/lib/garden/equipmentMapping";
import { todayIso } from "@/lib/dates";
import type { GrowingAreaType } from "@/db/schema";

type EventData = { userId: string; tenantId: string; quotaPoolKey: string };

/**
 * One user's monthly maintenance-task run — fanned out as an individual
 * event per eligible user from dailyJobsFn's own eligibility query, same
 * shape as applyWeatherAdviceFn (one step.run() per LLM call, proper
 * per-user Inngest memoization/retry isolation instead of looping AI calls
 * inside one un-resumable step). Not grouped like weather-advice — each
 * user's maintenance context (growing-area mix, tool ownership) is too
 * idiosyncratic to share a single AI call across users — so this function
 * only gets throttled, not restructured; quotaPoolKey (own tenant key vs.
 * the shared platform key — see getQuotaPoolKey in provider.ts) isolates
 * that throttle bucket per tenant's actual quota.
 */
export const generateMaintenanceTasksFn = inngest.createFunction(
  {
    id: "generate-maintenance-tasks",
    retries: 2,
    triggers: [{ event: "maintenance-tasks/requested" }],
    throttle: { key: "event.data.quotaPoolKey", limit: 10, period: "1m" },
  },
  async ({ event, step }) => {
    const { userId, tenantId } = event.data as EventData;

    const context = await step.run("gather-context", async () => {
      return withTenant(tenantId, async (tx) => {
        const [profile, areas, allEquipmentTypes, owned] = await Promise.all([
          tx.select().from(userProfiles).where(eq(userProfiles.userId, userId)),
          // Only areas something is actually growing in — an available/
          // reserved pot has nothing to weed or mulch yet.
          tx.select().from(growingAreas).where(and(eq(growingAreas.userId, userId), eq(growingAreas.status, "in_use"))),
          tx.select().from(equipmentTypes).where(eq(equipmentTypes.tenantId, tenantId)),
          tx.select({ equipmentTypeId: userEquipment.equipmentTypeId }).from(userEquipment).where(eq(userEquipment.userId, userId)),
        ]);

        const countByType = new Map<GrowingAreaType, number>();
        for (const area of areas) {
          countByType.set(area.type, (countByType.get(area.type) ?? 0) + 1);
        }

        // Tools only — growing-space equipment (pots/trays/planters/beds)
        // isn't something you'd need for a weeding/mulching task.
        const toolTypes = allEquipmentTypes.filter((t) => !(t.slug in SLUG_TO_GROWING_AREA_TYPE));
        const ownedEquipmentTypeIds = new Set(owned.map((o) => o.equipmentTypeId));

        return {
          expertiseLevel: profile[0]?.expertiseLevel ?? null,
          growingAreaCounts: [...countByType.entries()].map(([type, count]) => ({ type, count })),
          toolTypes: toolTypes.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
          ownedToolSlugs: toolTypes.filter((t) => ownedEquipmentTypeIds.has(t.id)).map((t) => t.slug),
        };
      });
    });

    if (context.growingAreaCounts.length === 0) return;

    try {
      const maintenanceTasks = await step.run("call-agent", async () => {
        const result = await generateMaintenanceTasks(tenantId, {
          today: todayIso(),
          growingAreaCounts: context.growingAreaCounts,
          toolCatalog: context.toolTypes.map((t) => ({ slug: t.slug, name: t.name })),
          ownedToolSlugs: context.ownedToolSlugs,
          expertiseLevel: context.expertiseLevel,
        });
        return result.output.tasks;
      });

      await step.run("persist-results", async () => {
        await withTenant(tenantId, async (tx) => {
          // Same slug-hallucination guard growPlanner.ts's persist step
          // uses for cropSlug: the model can only have been given these
          // exact slugs, but validate before trusting one for an insert —
          // an unknown/invented slug silently resolves to null instead of
          // crashing or writing an undefined equipmentTypeId.
          const equipmentTypeIdBySlug = new Map(context.toolTypes.map((t) => [t.slug, t.id]));
          const ownedToolSlugs = new Set(context.ownedToolSlugs);

          if (maintenanceTasks.length > 0) {
            await tx.insert(tasks).values(
              maintenanceTasks.map((t) => ({
                tenantId,
                userId,
                title: t.title,
                notes: t.explanation,
                dueDate: t.dueDate,
                source: "maintenance" as const,
              })),
            );
          }

          // One shopping-list item per distinct missing tool, not per task
          // — two tasks both needing a hand trowel shouldn't list it twice.
          const missingToolEquipmentTypeIds = new Set(
            maintenanceTasks
              .map((t) => (t.requiredToolSlug ? equipmentTypeIdBySlug.get(t.requiredToolSlug) : undefined))
              .filter((id): id is string => Boolean(id))
              .filter((id) => {
                const slug = context.toolTypes.find((t) => t.id === id)?.slug;
                return slug ? !ownedToolSlugs.has(slug) : false;
              }),
          );

          if (missingToolEquipmentTypeIds.size > 0) {
            // Same existence-check dedupe (no status/source filter) used
            // identically for equipment shopping-list inserts elsewhere —
            // see generateGrowPlan.ts's purchasable-growing-space-equipment
            // step.
            const existingItems = await tx
              .select({ equipmentTypeId: shoppingListItems.equipmentTypeId })
              .from(shoppingListItems)
              .where(
                and(
                  eq(shoppingListItems.userId, userId),
                  inArray(shoppingListItems.equipmentTypeId, [...missingToolEquipmentTypeIds]),
                ),
              );
            const alreadyListed = new Set(existingItems.map((i) => i.equipmentTypeId));
            const newEquipmentTypeIds = [...missingToolEquipmentTypeIds].filter((id) => !alreadyListed.has(id));
            if (newEquipmentTypeIds.length > 0) {
              await tx.insert(shoppingListItems).values(
                newEquipmentTypeIds.map((equipmentTypeId) => ({
                  tenantId,
                  userId,
                  equipmentTypeId,
                  quantityLabel: "1",
                  source: "ai" as const,
                })),
              );
            }
          }

          // Same transaction as the inserts above — Inngest memoizes at the
          // step boundary, so if this update were a separate step and it
          // failed after the inserts already succeeded and memoized,
          // dailyJobsFn's daily (not monthly) cron would keep re-flagging
          // this user as eligible and re-running (re-costing, re-inserting)
          // this whole thing every day for the rest of the month.
          await tx
            .update(userProfiles)
            .set({ lastMaintenanceTasksGeneratedAt: new Date() })
            .where(eq(userProfiles.userId, userId));
        });
      });
    } catch (err) {
      // No dedicated status row for a background run (nothing user-facing
      // polls this) — Inngest's own retry (retries: 2 above) already gives
      // resilience; just log so a persistent failure is visible in the dev
      // server / Inngest dashboard, matching applyWeatherAdviceFn.
      console.error(`[generate-maintenance-tasks] failed for user ${userId}:`, err);
      throw err;
    }
  },
);
