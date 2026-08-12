import { randomUUID } from "node:crypto";
import { eq, and, inArray, notInArray, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import {
  planRecommendations,
  planRecommendationStages,
  tasks,
  userProfiles,
  growingAreas,
  seedInventory,
  userFavoriteCrops,
  harvestLog,
  crops,
  cropVarieties,
  shoppingListItems,
} from "@/db/schema";
import {
  generateRecommendationReplacement,
  type RecommendationReplacementInput,
  type StageShape,
} from "@/lib/ai/agents/recommendationReplacement";
import { getCropFacts } from "@/lib/ai/agents/cropFacts";
import { getVarietyFacts, type ParentCropFacts } from "@/lib/ai/agents/varietyFacts";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type EventData = { recommendationIds: string[]; growPlanId: string; tenantId: string; userId: string };

type InstanceStage = {
  stageIndex: number;
  growingAreaId: string | null;
  type: string | null;
  sizeValue: number | null;
  sizeUnit: "cm" | "litres" | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
};
type Instance = { recommendationId: string; cropId: string; regenerationCount: number; stages: InstanceStage[] };

export const regenerateRecommendationFn = inngest.createFunction(
  { id: "regenerate-recommendation", retries: 2, triggers: [{ event: "recommendation/rejected" }] },
  async ({ event, step }) => {
    const { recommendationIds, growPlanId, tenantId, userId } = event.data as EventData;

    // Same placement as generateGrowPlan.ts's gather-context — outside the
    // try block below, so a failure here relies on Inngest's own retries
    // rather than the revert-to-pending catch step (matches that function's
    // existing, accepted structure rather than inventing a different one).
    const context = await step.run("gather-context", async () => {
      const allCrops = await db.select().from(crops);
      const cropById = new Map(allCrops.map((c) => [c.id, c]));
      const allVarieties = await db.select().from(cropVarieties);
      const varietyById = new Map(allVarieties.map((v) => [v.id, v]));
      const varietiesByCropId = new Map<string, typeof allVarieties>();
      for (const v of allVarieties) {
        const list = varietiesByCropId.get(v.cropId) ?? [];
        list.push(v);
        varietiesByCropId.set(v.cropId, list);
      }

      return withTenant(tenantId, async (tx) => {
        const [profile, seeds, favorites, harvests, rejectedRecs, stageRows, otherActiveRecs] = await Promise.all([
          tx.select().from(userProfiles).where(eq(userProfiles.userId, userId)),
          tx.select().from(seedInventory).where(eq(seedInventory.userId, userId)),
          tx.select().from(userFavoriteCrops).where(eq(userFavoriteCrops.userId, userId)),
          tx.select().from(harvestLog).where(eq(harvestLog.userId, userId)),
          tx.select().from(planRecommendations).where(inArray(planRecommendations.id, recommendationIds)),
          tx
            .select({ stage: planRecommendationStages, area: growingAreas })
            .from(planRecommendationStages)
            .leftJoin(growingAreas, eq(planRecommendationStages.growingAreaId, growingAreas.id))
            .where(inArray(planRecommendationStages.planRecommendationId, recommendationIds)),
          tx
            .select({ cropId: planRecommendations.cropId })
            .from(planRecommendations)
            .where(
              and(
                eq(planRecommendations.growPlanId, growPlanId),
                inArray(planRecommendations.status, ["pending", "accepted", "regenerating"]),
                notInArray(planRecommendations.id, recommendationIds),
              ),
            ),
        ]);

        const stagesByRec = new Map<string, typeof stageRows>();
        for (const row of stageRows) {
          const list = stagesByRec.get(row.stage.planRecommendationId) ?? [];
          list.push(row);
          stagesByRec.set(row.stage.planRecommendationId, list);
        }

        // Every instance shares the same stage shape by construction — they
        // were only groupable in the UI because they're identical.
        const instances: Instance[] = recommendationIds
          .map((id) => {
            const rec = rejectedRecs.find((r) => r.id === id);
            const stages = (stagesByRec.get(id) ?? [])
              .sort((a, b) => a.stage.stageIndex - b.stage.stageIndex)
              .map(({ stage, area }) => ({
                stageIndex: stage.stageIndex,
                growingAreaId: stage.growingAreaId,
                type: area?.type ?? null,
                sizeValue: area?.sizeValue ?? null,
                sizeUnit: area?.sizeUnit ?? null,
                widthCm: area?.widthCm ?? null,
                lengthCm: area?.lengthCm ?? null,
                depthCm: area?.depthCm ?? null,
              }));
            return { recommendationId: id, cropId: rec?.cropId ?? "", regenerationCount: rec?.regenerationCount ?? 0, stages };
          })
          .filter((inst) => inst.cropId && inst.stages.length > 0);

        const stageShape: StageShape[] = instances[0]?.stages.map((s) => ({
          type: s.type ?? "pot",
          sizeValue: s.sizeValue,
          sizeUnit: s.sizeUnit,
          widthCm: s.widthCm,
          lengthCm: s.lengthCm,
          depthCm: s.depthCm,
        })) ?? [];

        const rejectedCropSlugs = instances
          .map((inst) => cropById.get(inst.cropId)?.slug)
          .filter((s): s is string => Boolean(s));
        const otherActiveCropSlugs = otherActiveRecs
          .map((r) => cropById.get(r.cropId)?.slug)
          .filter((s): s is string => Boolean(s));
        const excludedCropSlugs = [...new Set([...rejectedCropSlugs, ...otherActiveCropSlugs])];

        const input: RecommendationReplacementInput = {
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
          stageShape,
          instanceCount: instances.length,
          excludedCropSlugs,
          ownedSeeds: seeds
            .map((s) => {
              const cropSlug = cropById.get(s.cropId)?.slug;
              if (!cropSlug) return null;
              const varietySlug = s.varietyId ? (varietyById.get(s.varietyId)?.slug ?? null) : null;
              return { cropSlug, varietySlug };
            })
            .filter((s): s is { cropSlug: string; varietySlug: string | null } => s !== null),
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
            estimatedRetailPricePerKgGbp: c.estimatedRetailPricePerKgGbp,
            feedingNotes: c.feedingNotes,
            varieties: (varietiesByCropId.get(c.id) ?? []).map((v) => ({
              slug: v.slug,
              name: v.name,
              daysToHarvestMin: v.daysToHarvestMin ?? c.daysToHarvestMin,
              daysToHarvestMax: v.daysToHarvestMax ?? c.daysToHarvestMax,
              spacingCm: v.spacingCm ?? c.spacingCm,
              growthHabit: v.growthHabit,
              diseaseResistanceNotes: v.diseaseResistanceNotes,
              characteristics: v.characteristics,
              estimatedRetailPricePerKgGbp: v.estimatedRetailPricePerKgGbp ?? c.estimatedRetailPricePerKgGbp,
            })),
          })),
        };

        const cropIdBySlug: Record<string, string> = Object.fromEntries(allCrops.map((c) => [c.slug, c.id]));
        const varietyIdByCropSlugAndVarietySlug: Record<string, string> = {};
        for (const c of allCrops) {
          for (const v of varietiesByCropId.get(c.id) ?? []) {
            varietyIdByCropSlugAndVarietySlug[`${c.slug}|${v.slug}`] = v.id;
          }
        }
        return { input, cropIdBySlug, varietyIdByCropSlugAndVarietySlug, instances };
      });
    });

    try {
      const result = await step.run("call-agent", () => generateRecommendationReplacement(tenantId, context.input));

      // Single-candidate version of generateGrowPlan.ts's resolve-new-crops
      // (now resolving a variety too) — duplicated rather than extracted/
      // shared, same reasoning as that function's own comment: the two call
      // sites' surrounding shape (batch vs. one) differs enough that
      // sharing isn't worth risking proven code for. Variety resolution
      // runs after the crop above, using its now-final id — same ordering
      // requirement as generateGrowPlan.ts's sibling logic.
      const resolved = await step.run("resolve-new-crop", async () => {
        const cropIdBySlug = context.cropIdBySlug;
        let replacementCropId: string;

        if (cropIdBySlug[result.output.cropSlug]) {
          replacementCropId = cropIdBySlug[result.output.cropSlug];
        } else if (!result.output.newCropName) {
          throw new Error(`Unknown crop slug "${result.output.cropSlug}" with no newCropName to back it`);
        } else {
          const aiSlug = slugify(result.output.cropSlug);
          const [existingByAiSlug] = await db.select({ id: crops.id }).from(crops).where(eq(crops.slug, aiSlug));
          if (existingByAiSlug) {
            replacementCropId = existingByAiSlug.id;
          } else {
            const [{ maxSortOrder }] = await db
              .select({ maxSortOrder: sql<number>`coalesce(max(${crops.sortOrder}), 0)` })
              .from(crops);
            const facts = await getCropFacts(tenantId, result.output.newCropName);
            // Store cropFacts's own corrected name/spelling, not the
            // replacement agent's own newCropName — same reasoning/pattern
            // as generateGrowPlan.ts's resolve-new-crops and seeds.ts's
            // addSeedAction: this catalog is shared and reused (including
            // by the /seeds autocomplete), so it should only ever hold the
            // corrected name. Re-check under the corrected slug too, not
            // just the AI's original one.
            const correctedSlug = slugify(facts.output.name) || aiSlug;
            const [existingByCorrectedSlug] = await db
              .select({ id: crops.id })
              .from(crops)
              .where(eq(crops.slug, correctedSlug));
            if (existingByCorrectedSlug) {
              replacementCropId = existingByCorrectedSlug.id;
            } else {
              await db
                .insert(crops)
                .values({
                  slug: correctedSlug,
                  name: facts.output.name,
                  category: facts.output.category,
                  emoji: facts.output.emoji,
                  spacingCm: facts.output.spacingCm,
                  soilDepthCm: facts.output.soilDepthCm,
                  sowIndoorFromMonth: facts.output.sowIndoorFromMonth,
                  sowIndoorToMonth: facts.output.sowIndoorToMonth,
                  sowOutdoorFromMonth: facts.output.sowOutdoorFromMonth,
                  sowOutdoorToMonth: facts.output.sowOutdoorToMonth,
                  daysToHarvestMin: facts.output.daysToHarvestMin,
                  daysToHarvestMax: facts.output.daysToHarvestMax,
                  supportsSuccessionSowing: facts.output.supportsSuccessionSowing,
                  estimatedRetailPricePerKgGbp: facts.output.estimatedRetailPricePerKgGbp,
                  feedingNotes: facts.output.feedingNotes,
                  sortOrder: maxSortOrder + 1,
                  verified: false,
                  sourceProvider: facts.provider,
                  sourceModel: facts.model,
                })
                .onConflictDoNothing({ target: crops.slug });

              const [row] = await db.select({ id: crops.id }).from(crops).where(eq(crops.slug, correctedSlug));
              replacementCropId = row.id;
            }
          }
        }

        let replacementVarietyId: string | null = null;
        if (result.output.varietySlug) {
          const varietyKey = `${result.output.cropSlug}|${result.output.varietySlug}`;
          const preSeeded = context.varietyIdByCropSlugAndVarietySlug[varietyKey];
          if (preSeeded) {
            replacementVarietyId = preSeeded;
          } else {
            const varietyAiSlug = slugify(result.output.varietySlug);
            const [existingVarietyByAiSlug] = await db
              .select({ id: cropVarieties.id })
              .from(cropVarieties)
              .where(and(eq(cropVarieties.cropId, replacementCropId), eq(cropVarieties.slug, varietyAiSlug)));
            if (existingVarietyByAiSlug) {
              replacementVarietyId = existingVarietyByAiSlug.id;
            } else if (result.output.newVarietyName) {
              const [parentRow] = await db.select().from(crops).where(eq(crops.id, replacementCropId));
              const parentFacts: ParentCropFacts = {
                name: parentRow.name,
                category: parentRow.category,
                spacingCm: parentRow.spacingCm,
                daysToHarvestMin: parentRow.daysToHarvestMin,
                daysToHarvestMax: parentRow.daysToHarvestMax,
                estimatedRetailPricePerKgGbp: parentRow.estimatedRetailPricePerKgGbp,
              };
              const varietyFacts = await getVarietyFacts(
                tenantId,
                parentFacts.name,
                result.output.newVarietyName,
                parentFacts,
              );
              const correctedVarietySlug = slugify(varietyFacts.output.name) || varietyAiSlug;
              const [existingVarietyByCorrectedSlug] = await db
                .select({ id: cropVarieties.id })
                .from(cropVarieties)
                .where(and(eq(cropVarieties.cropId, replacementCropId), eq(cropVarieties.slug, correctedVarietySlug)));
              if (existingVarietyByCorrectedSlug) {
                replacementVarietyId = existingVarietyByCorrectedSlug.id;
              } else {
                await db
                  .insert(cropVarieties)
                  .values({
                    cropId: replacementCropId,
                    slug: correctedVarietySlug,
                    name: varietyFacts.output.name,
                    daysToHarvestMin: varietyFacts.output.daysToHarvestMin,
                    daysToHarvestMax: varietyFacts.output.daysToHarvestMax,
                    spacingCm: varietyFacts.output.spacingCm,
                    growthHabit: varietyFacts.output.growthHabit,
                    diseaseResistanceNotes: varietyFacts.output.diseaseResistanceNotes,
                    characteristics: varietyFacts.output.characteristics,
                    estimatedRetailPricePerKgGbp: varietyFacts.output.estimatedRetailPricePerKgGbp,
                    verified: false,
                    sourceProvider: varietyFacts.provider,
                    sourceModel: varietyFacts.model,
                  })
                  .onConflictDoNothing({ target: [cropVarieties.cropId, cropVarieties.slug] });

                const [row] = await db
                  .select({ id: cropVarieties.id })
                  .from(cropVarieties)
                  .where(and(eq(cropVarieties.cropId, replacementCropId), eq(cropVarieties.slug, correctedVarietySlug)));
                replacementVarietyId = row.id;
              }
            }
          }
        }

        return { cropId: replacementCropId, varietyId: replacementVarietyId };
      });
      const replacementCropId = resolved.cropId;
      const replacementVarietyId = resolved.varietyId;

      // One transaction for everything: inserting all N replacement
      // instances AND retiring all N rejected ones. A multi-step version
      // risks a failure partway through leaving some instances swapped and
      // others not — Postgres rollback makes "all N or none" free instead.
      await step.run("persist", async () => {
        await withTenant(tenantId, async (tx) => {
          const { instances } = context;
          const validTasks = result.output.tasks.filter((t) => t.dueDate);

          const newRecs = await tx
            .insert(planRecommendations)
            .values(
              instances.map((inst) => ({
                tenantId,
                growPlanId,
                cropId: replacementCropId,
                varietyId: replacementVarietyId,
                reasoning: result.output.reasoning,
                requiresPurchase: result.output.requiresPurchase,
                estimatedHarvestStart: result.output.estimatedHarvestStart,
                estimatedHarvestEnd: result.output.estimatedHarvestEnd,
                status: "pending" as const,
                regenerationCount: inst.regenerationCount + 1,
              })),
            )
            .returning();

          const stageRows = instances.flatMap((inst, i) =>
            inst.stages.map((s) => ({
              tenantId,
              planRecommendationId: newRecs[i].id,
              stageIndex: s.stageIndex,
              growingAreaId: s.growingAreaId,
              status: s.stageIndex === 0 ? ("active" as const) : ("upcoming" as const),
            })),
          );
          const insertedStages = await tx.insert(planRecommendationStages).values(stageRows).returning();
          const stageIdByRecAndIndex = new Map<string, string>();
          for (const s of insertedStages) {
            stageIdByRecAndIndex.set(`${s.planRecommendationId}|${s.stageIndex}`, s.id);
          }

          if (validTasks.length > 0) {
            // One series id per instance (not shared across instances) —
            // each of e.g. "3 pots of Spring Onion" is a separate physical
            // growing space, so their succession campaigns track
            // independently, matching how each instance already keeps its
            // own regenerationCount/stages/tasks.
            const seriesIdByInstance = instances.map(() => randomUUID());
            await tx.insert(tasks).values(
              instances.flatMap((_inst, i) =>
                validTasks.map((t) => ({
                  tenantId,
                  userId,
                  title: t.title,
                  notes: t.explanation,
                  dueDate: t.dueDate,
                  hardDeadlineDate: t.hardDeadlineDate,
                  cropId: replacementCropId,
                  varietyId: replacementVarietyId,
                  planRecommendationId: newRecs[i].id,
                  successionSeriesId: t.isSuccessionResow ? seriesIdByInstance[i] : null,
                  estimatedSeedsUsed: t.estimatedSeedsUsed,
                  activatesStageId:
                    t.activatesStageIndex != null
                      ? (stageIdByRecAndIndex.get(`${newRecs[i].id}|${t.activatesStageIndex}`) ?? null)
                      : null,
                  isIndoor: t.isIndoor,
                  source: "ai" as const,
                })),
              ),
            );
          }

          if (result.output.requiresPurchase) {
            const [existingItem] = await tx
              .select({ id: shoppingListItems.id })
              .from(shoppingListItems)
              .where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.cropId, replacementCropId)));
            if (!existingItem) {
              await tx.insert(shoppingListItems).values({
                tenantId,
                userId,
                cropId: replacementCropId,
                quantityLabel: "1 packet",
                source: "ai" as const,
              });
            }
          }

          const oldRecIds = instances.map((inst) => inst.recommendationId);
          await tx.delete(tasks).where(inArray(tasks.planRecommendationId, oldRecIds));
          await tx
            .update(planRecommendationStages)
            .set({ growingAreaId: null })
            .where(inArray(planRecommendationStages.planRecommendationId, oldRecIds));
          await tx.update(planRecommendations).set({ status: "rejected" }).where(inArray(planRecommendations.id, oldRecIds));
        });
      });
    } catch {
      await step.run("revert-to-pending", async () => {
        await withTenant(tenantId, async (tx) => {
          await tx
            .update(planRecommendations)
            .set({ status: "pending" })
            .where(inArray(planRecommendations.id, recommendationIds));
        });
      });
    }
  },
);
