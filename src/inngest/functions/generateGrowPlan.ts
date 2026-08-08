import { eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import {
  growPlans,
  planRecommendations,
  tasks,
  userProfiles,
  growingAreas,
  seedInventory,
  userFavoriteCrops,
  harvestLog,
  crops,
} from "@/db/schema";
import { generateGrowPlan, type GrowPlannerInput } from "@/lib/ai/agents/growPlanner";

type EventData = { growPlanId: string; tenantId: string; userId: string };

export const generateGrowPlanFn = inngest.createFunction(
  { id: "generate-grow-plan", retries: 2, triggers: [{ event: "grow-plan/requested" }] },
  async ({ event, step }) => {
    const { growPlanId, tenantId, userId } = event.data as EventData;

    const context = await step.run("gather-context", async () => {
      const allCrops = await db.select().from(crops);
      const cropById = new Map(allCrops.map((c) => [c.id, c]));

      return withTenant(tenantId, async (tx) => {
        const [profile, areas, seeds, favorites, harvests] = await Promise.all([
          tx.select().from(userProfiles).where(eq(userProfiles.userId, userId)),
          tx.select().from(growingAreas).where(eq(growingAreas.userId, userId)),
          tx.select().from(seedInventory).where(eq(seedInventory.userId, userId)),
          tx.select().from(userFavoriteCrops).where(eq(userFavoriteCrops.userId, userId)),
          tx.select().from(harvestLog).where(eq(harvestLog.userId, userId)),
        ]);

        const areaCounts = new Map<string, number>();
        for (const area of areas) areaCounts.set(area.type, (areaCounts.get(area.type) ?? 0) + 1);

        const input: GrowPlannerInput = {
          today: new Date().toISOString().slice(0, 10),
          profile: {
            postcode: profile[0]?.postcode ?? null,
            plotSize: profile[0]?.plotSize ?? null,
            avgSunlightHours: profile[0]?.avgSunlightHours ?? null,
            householdSize: profile[0]?.householdSize ?? null,
            expertiseLevel: profile[0]?.expertiseLevel ?? null,
            hasIndoorSeedlingSpace: profile[0]?.hasIndoorSeedlingSpace ?? null,
            weekdayHoursAvailable: profile[0]?.weekdayHoursAvailable ?? null,
            weekendHoursAvailable: profile[0]?.weekendHoursAvailable ?? null,
          },
          growingAreaCounts: [...areaCounts.entries()].map(([type, count]) => ({ type, count })),
          ownedSeedCropSlugs: seeds
            .map((s) => cropById.get(s.cropId)?.slug)
            .filter((s): s is string => Boolean(s)),
          favoriteCropSlugs: favorites
            .filter((f) => f.liked)
            .map((f) => cropById.get(f.cropId)?.slug)
            .filter((s): s is string => Boolean(s)),
          dislikedCropSlugs: favorites
            .filter((f) => !f.liked)
            .map((f) => cropById.get(f.cropId)?.slug)
            .filter((s): s is string => Boolean(s)),
          harvestHistory: harvests
            .map((h) => {
              const slug = cropById.get(h.cropId)?.slug;
              return slug
                ? { cropSlug: slug, quantity: h.quantity, unit: h.unit, harvestedAt: h.harvestedAt }
                : null;
            })
            .filter((h): h is NonNullable<typeof h> => h !== null),
          availableCrops: allCrops.map((c) => ({
            slug: c.slug,
            name: c.name,
            category: c.category,
            spacingCm: c.spacingCm,
            soilDepthCm: c.soilDepthCm,
            sowIndoorFromMonth: c.sowIndoorFromMonth,
            sowIndoorToMonth: c.sowIndoorToMonth,
            sowOutdoorFromMonth: c.sowOutdoorFromMonth,
            sowOutdoorToMonth: c.sowOutdoorToMonth,
            daysToHarvestMin: c.daysToHarvestMin,
            daysToHarvestMax: c.daysToHarvestMax,
            supportsSuccessionSowing: c.supportsSuccessionSowing,
            feedingNotes: c.feedingNotes,
          })),
        };

        const cropIdBySlug: Record<string, string> = Object.fromEntries(
          allCrops.map((c) => [c.slug, c.id]),
        );
        return { input, cropIdBySlug };
      });
    });

    try {
      const result = await step.run("call-agent", () => generateGrowPlan(tenantId, context.input));

      await step.run("persist-results", async () => {
        await withTenant(tenantId, async (tx) => {
          const cropIdBySlug = context.cropIdBySlug;

          const validRecommendations = result.output.recommendations.filter((r) => cropIdBySlug[r.cropSlug]);
          if (validRecommendations.length > 0) {
            await tx.insert(planRecommendations).values(
              validRecommendations.map((r) => ({
                tenantId,
                growPlanId,
                cropId: cropIdBySlug[r.cropSlug],
                reasoning: r.reasoning,
                requiresPurchase: r.requiresPurchase,
                estimatedHarvestStart: r.estimatedHarvestStart,
                estimatedHarvestEnd: r.estimatedHarvestEnd,
              })),
            );
          }

          const validTasks = result.output.tasks.filter((t) => t.dueDate);
          if (validTasks.length > 0) {
            await tx.insert(tasks).values(
              validTasks.map((t) => ({
                tenantId,
                userId,
                title: t.title,
                notes: t.explanation,
                dueDate: t.dueDate,
                hardDeadlineDate: t.hardDeadlineDate,
                source: "ai" as const,
              })),
            );
          }

          await tx
            .update(growPlans)
            .set({
              status: "complete",
              provider: result.provider,
              model: result.model,
              rawOutput: result.output,
              completedAt: new Date(),
            })
            .where(eq(growPlans.id, growPlanId));
        });
      });
    } catch (err) {
      await step.run("mark-failed", async () => {
        await withTenant(tenantId, async (tx) => {
          await tx
            .update(growPlans)
            .set({
              status: "failed",
              errorMessage: err instanceof Error ? err.message : "Unknown error",
              completedAt: new Date(),
            })
            .where(eq(growPlans.id, growPlanId));
        });
      });
    }
  },
);
