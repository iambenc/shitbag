import { randomUUID } from "node:crypto";
import { eq, and, inArray, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import {
  growPlans,
  planRecommendations,
  planRecommendationStages,
  tasks,
  userProfiles,
  growingAreas,
  seedInventory,
  userFavoriteCrops,
  harvestLog,
  crops,
  shoppingListItems,
  equipmentTypes,
  userEquipment,
} from "@/db/schema";
import { generateGrowPlan, type GrowPlannerInput } from "@/lib/ai/agents/growPlanner";
import { getCropFacts } from "@/lib/ai/agents/cropFacts";
import { PURCHASABLE_GROWING_SPACE_SLUGS, SLUG_TO_GROWING_AREA_TYPE } from "@/lib/garden/equipmentMapping";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Walks a recommendation's proposed stages in order, keeping only the valid
// prefix — an area must be available and not already claimed by an earlier
// stage in this same run. Truncates at the first invalid/duplicate stage
// rather than dropping the whole recommendation, since stage 0 alone is
// still a fully valid (if downgraded) plan. Mutates usedAreaIds as it goes.
function validStagesFor(
  stages: { growingAreaId: string }[],
  availableAreaIds: Set<string>,
  usedAreaIds: Set<string>,
): { growingAreaId: string }[] {
  const valid: { growingAreaId: string }[] = [];
  for (const stage of stages) {
    if (!availableAreaIds.has(stage.growingAreaId) || usedAreaIds.has(stage.growingAreaId)) break;
    usedAreaIds.add(stage.growingAreaId);
    valid.push(stage);
  }
  return valid;
}

type EventData = { growPlanId: string; tenantId: string; userId: string; wantsUnusualCrop?: boolean };

export const generateGrowPlanFn = inngest.createFunction(
  { id: "generate-grow-plan", retries: 2, triggers: [{ event: "grow-plan/requested" }] },
  async ({ event, step }) => {
    const { growPlanId, tenantId, userId, wantsUnusualCrop } = event.data as EventData;

    // Every generation is a full re-plan of the whole plot: free whatever
    // the user's *previous* plan claimed (both fully-occupied and merely
    // reserved-for-a-later-stage areas) before gathering what's available
    // now, so regenerating doesn't find zero available areas (all still
    // claimed from last time) and produce nothing. Also nulls out the old
    // stage rows' growingAreaId so they always reflect "currently filling,"
    // not just "filled at creation time" — otherwise once a freed area gets
    // reassigned to a new plan, two stage rows (one stale, one real) would
    // both point at it and a later "what's growing in area X" query could
    // show the wrong crop. Runs before gather-context (which reads
    // status=available), outside the try block below, same placement as
    // gather-context itself.
    await step.run("free-previous-growing-areas", async () => {
      await withTenant(tenantId, async (tx) => {
        const previouslyClaimed = await tx
          .select({ id: growingAreas.id })
          .from(growingAreas)
          .where(and(eq(growingAreas.userId, userId), inArray(growingAreas.status, ["in_use", "reserved"])));
        if (previouslyClaimed.length === 0) return;

        const ids = previouslyClaimed.map((a) => a.id);
        await tx.update(growingAreas).set({ status: "available" }).where(inArray(growingAreas.id, ids));
        await tx
          .update(planRecommendationStages)
          .set({ growingAreaId: null })
          .where(inArray(planRecommendationStages.growingAreaId, ids));
      });
    });

    const context = await step.run("gather-context", async () => {
      const allCrops = await db.select().from(crops);
      const cropById = new Map(allCrops.map((c) => [c.id, c]));

      return withTenant(tenantId, async (tx) => {
        const [profile, allAreas, ownedEquipment, seeds, favorites, harvests] = await Promise.all([
          tx.select().from(userProfiles).where(eq(userProfiles.userId, userId)),
          tx.select().from(growingAreas).where(eq(growingAreas.userId, userId)),
          tx
            .select({ equipment: userEquipment, type: equipmentTypes })
            .from(userEquipment)
            .innerJoin(equipmentTypes, eq(userEquipment.equipmentTypeId, equipmentTypes.id))
            .where(eq(userEquipment.userId, userId)),
          tx.select().from(seedInventory).where(eq(seedInventory.userId, userId)),
          tx.select().from(userFavoriteCrops).where(eq(userFavoriteCrops.userId, userId)),
          tx.select().from(harvestLog).where(eq(harvestLog.userId, userId)),
        ]);

        // Post-freeing, "available" is effectively "all of them" on a normal
        // regenerate — but stays correct if something external ever sets
        // in_use again mid-run.
        const availableAreas = allAreas.filter((a) => a.status === "available");

        // "Placed" (any status) vs. owned — the gap is equipment the user
        // could place via /garden but hasn't, surfaced so the AI can nudge
        // them toward growing more rather than the planner ever inventing
        // space itself.
        const placedCountByEquipmentId = new Map<string, number>();
        for (const area of allAreas) {
          if (!area.sourceUserEquipmentId) continue;
          placedCountByEquipmentId.set(
            area.sourceUserEquipmentId,
            (placedCountByEquipmentId.get(area.sourceUserEquipmentId) ?? 0) + 1,
          );
        }
        const unplacedEquipment = ownedEquipment
          .filter((r) => r.type.slug in SLUG_TO_GROWING_AREA_TYPE)
          .map((r) => ({
            type: SLUG_TO_GROWING_AREA_TYPE[r.type.slug],
            unplaced: r.equipment.quantity - (placedCountByEquipmentId.get(r.equipment.id) ?? 0),
          }))
          .filter((e) => e.unplaced > 0)
          .map((e) => ({ type: e.type, count: e.unplaced }));

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
          growingAreas: availableAreas.map((a) => ({
            id: a.id,
            type: a.type,
            sizeValue: a.sizeValue,
            sizeUnit: a.sizeUnit,
            widthCm: a.widthCm,
            lengthCm: a.lengthCm,
            depthCm: a.depthCm,
          })),
          unplacedEquipment,
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
            estimatedRetailPricePerKgGbp: c.estimatedRetailPricePerKgGbp,
            feedingNotes: c.feedingNotes,
          })),
          wantsUnusualCrop: wantsUnusualCrop ?? false,
        };

        const cropIdBySlug: Record<string, string> = Object.fromEntries(
          allCrops.map((c) => [c.slug, c.id]),
        );
        return { input, cropIdBySlug, availableGrowingAreaIds: availableAreas.map((a) => a.id) };
      });
    });

    try {
      const result = await step.run("call-agent", () => generateGrowPlan(tenantId, context.input));

      // Crops the AI proposed that aren't in the catalog snapshot it was
      // given. Live-checks the DB by slug before ever calling the facts
      // agent — another tenant's run may have already backfilled the same
      // crop since gather-context ran — and only then falls back to AI.
      // Runs sequentially (not Promise.all) so a duplicate proposal within
      // this same output self-dedupes on its second pass. Uses the plain
      // unscoped `db` client throughout, same as gather-context's crops
      // reads: this table has no tenant concept to scope by.
      const resolvedCropIdBySlug = await step.run("resolve-new-crops", async () => {
        const merged: Record<string, string> = { ...context.cropIdBySlug };
        const candidates = result.output.recommendations.filter((r) => r.newCropName && !merged[r.cropSlug]);
        if (candidates.length === 0) return merged;

        const [{ maxSortOrder }] = await db
          .select({ maxSortOrder: sql<number>`coalesce(max(${crops.sortOrder}), 0)` })
          .from(crops);
        let nextSortOrder = maxSortOrder + 1;

        for (const r of candidates) {
          if (merged[r.cropSlug]) continue;
          const aiSlug = slugify(r.cropSlug);

          const [existingByAiSlug] = await db.select({ id: crops.id }).from(crops).where(eq(crops.slug, aiSlug));
          if (existingByAiSlug) {
            merged[r.cropSlug] = existingByAiSlug.id;
            continue;
          }

          const facts = await getCropFacts(tenantId, r.newCropName!);
          // Store cropFacts's own corrected name/spelling, not whatever the
          // planner itself proposed in newCropName — the planner is a large,
          // multi-crop generation call, not a spelling authority, and this
          // catalog is shared/reused by every future user (including the
          // /seeds autocomplete, which reads crops.name directly) — see
          // seeds.ts's addSeedAction for the identical pattern. Re-check for
          // an existing row under the corrected slug too, not just the AI's
          // original one: a differently-named proposal from an earlier run
          // may have already resolved to the same canonical crop.
          const correctedSlug = slugify(facts.output.name) || aiSlug;
          const [existingByCorrectedSlug] = await db
            .select({ id: crops.id })
            .from(crops)
            .where(eq(crops.slug, correctedSlug));
          if (existingByCorrectedSlug) {
            merged[r.cropSlug] = existingByCorrectedSlug.id;
            continue;
          }

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
              sortOrder: nextSortOrder,
              verified: false,
              sourceProvider: facts.provider,
              sourceModel: facts.model,
            })
            .onConflictDoNothing({ target: crops.slug });
          nextSortOrder++;

          const [row] = await db.select({ id: crops.id }).from(crops).where(eq(crops.slug, correctedSlug));
          merged[r.cropSlug] = row.id;
        }
        return merged;
      });

      await step.run("persist-results", async () => {
        await withTenant(tenantId, async (tx) => {
          const cropIdBySlug = resolvedCropIdBySlug;

          // A recommendation needs both a real crop AND at least one real,
          // un-claimed growing area to survive — same silent-drop-on-
          // invalid-reference pattern as the crop-slug check. Stages beyond
          // the first invalid/duplicate one are truncated rather than
          // dropping the whole recommendation (stage 0 alone is still a
          // fully valid, if downgraded, plan); dedup across every stage of
          // every recommendation doubles as the real capacity cap — an area
          // can never be claimed twice, whether by two recommendations or
          // two stages of the same one.
          const availableAreaIds = new Set(context.availableGrowingAreaIds);
          const usedAreaIds = new Set<string>();
          // originalIndex preserved through the filter/map chain — needed to
          // resolve each task's recommendationIndex back to the real,
          // persisted planRecommendationId below (recommendations can get
          // dropped here for an invalid crop/stages, so the surviving array's
          // own position isn't the same as the AI's original array position).
          const validRecommendations = result.output.recommendations
            .map((r, originalIndex) => ({ r, originalIndex }))
            .filter(({ r }) => cropIdBySlug[r.cropSlug])
            .map(({ r, originalIndex }) => ({ r, originalIndex, stages: validStagesFor(r.stages, availableAreaIds, usedAreaIds) }))
            .filter(({ stages }) => stages.length > 0);

          const stageIdByAreaId = new Map<string, string>();
          // Resolves a task's recommendationIndex to the real, persisted row
          // it belongs to — the only reliable way to link tasks back to a
          // specific recommendation (cropSlug alone is ambiguous whenever the
          // same crop appears in two recommendations, e.g. two lettuce beds).
          const recommendationIdByOriginalIndex = new Map<number, string>();
          if (validRecommendations.length > 0) {
            const insertedRecommendations = await tx
              .insert(planRecommendations)
              .values(
                validRecommendations.map(({ r }) => ({
                  tenantId,
                  growPlanId,
                  cropId: cropIdBySlug[r.cropSlug],
                  reasoning: r.reasoning,
                  requiresPurchase: r.requiresPurchase,
                  estimatedHarvestStart: r.estimatedHarvestStart,
                  estimatedHarvestEnd: r.estimatedHarvestEnd,
                  isUnusualSuggestion: r.isUnusualSuggestion,
                })),
              )
              .returning();
            validRecommendations.forEach(({ originalIndex }, i) => {
              recommendationIdByOriginalIndex.set(originalIndex, insertedRecommendations[i].id);
            });

            const stageRows = validRecommendations.flatMap(({ stages }, i) =>
              stages.map((stage, stageIndex) => ({
                tenantId,
                planRecommendationId: insertedRecommendations[i].id,
                stageIndex,
                growingAreaId: stage.growingAreaId,
                status: stageIndex === 0 ? ("active" as const) : ("upcoming" as const),
              })),
            );
            const insertedStages = await tx.insert(planRecommendationStages).values(stageRows).returning();
            for (const s of insertedStages) {
              if (s.growingAreaId) stageIdByAreaId.set(s.growingAreaId, s.id);
            }

            const firstStageAreaIds = insertedStages
              .filter((s) => s.stageIndex === 0)
              .map((s) => s.growingAreaId!);
            const laterStageAreaIds = insertedStages
              .filter((s) => s.stageIndex > 0)
              .map((s) => s.growingAreaId!);
            if (firstStageAreaIds.length > 0) {
              await tx.update(growingAreas).set({ status: "in_use" }).where(inArray(growingAreas.id, firstStageAreaIds));
            }
            if (laterStageAreaIds.length > 0) {
              await tx
                .update(growingAreas)
                .set({ status: "reserved" })
                .where(inArray(growingAreas.id, laterStageAreaIds));
            }
          }

          const validTasks = result.output.tasks.filter((t) => t.dueDate);
          if (validTasks.length > 0) {
            // First succession-resow task seen for a given (real, resolved)
            // recommendation generates the group's id; every later resow for
            // that same recommendation reuses it. Keyed by the resolved
            // planRecommendationId, not recommendationIndex directly, so a
            // task whose owning recommendation didn't survive validation
            // above naturally gets no series (can't reliably group an
            // orphaned task).
            const successionSeriesIdByRecommendationId = new Map<string, string>();
            await tx.insert(tasks).values(
              validTasks.map((t) => {
                const planRecommendationId = recommendationIdByOriginalIndex.get(t.recommendationIndex) ?? null;
                let successionSeriesId: string | null = null;
                if (t.isSuccessionResow && planRecommendationId) {
                  successionSeriesId = successionSeriesIdByRecommendationId.get(planRecommendationId) ?? null;
                  if (!successionSeriesId) {
                    successionSeriesId = randomUUID();
                    successionSeriesIdByRecommendationId.set(planRecommendationId, successionSeriesId);
                  }
                }
                return {
                  tenantId,
                  userId,
                  title: t.title,
                  notes: t.explanation,
                  dueDate: t.dueDate,
                  hardDeadlineDate: t.hardDeadlineDate,
                  // Lets the Phase 6 weekly shopping-list job find "the sow
                  // task for this crop" without a separate link table.
                  cropId: t.cropSlug ? (cropIdBySlug[t.cropSlug] ?? null) : null,
                  // Which specific recommendation this task belongs to —
                  // needed for reject cleanup (regenerateRecommendation.ts
                  // matches on this) and for succession-series grouping
                  // above; previously always left null here, which silently
                  // broke reject cleanup for any never-yet-regenerated
                  // recommendation's tasks.
                  planRecommendationId,
                  successionSeriesId,
                  estimatedSeedsUsed: t.estimatedSeedsUsed,
                  // Completing this task releases the preceding stage's area
                  // and claims this one — see toggleTaskCompleteAction. Left
                  // null if the AI referenced an area that didn't survive
                  // validation above, same silent-drop tolerance as everywhere
                  // else in this function.
                  activatesStageId: t.activatesGrowingAreaId ? (stageIdByAreaId.get(t.activatesGrowingAreaId) ?? null) : null,
                  isIndoor: t.isIndoor,
                  source: "ai" as const,
                };
              }),
            );
          }

          // Add shopping-list items immediately rather than waiting on the
          // weekly cron job (src/inngest/functions/weeklyShoppingList.ts,
          // left unchanged — it's now a backstop for plans generated before
          // this existed, not the primary path). Both inserts below land in
          // this same transaction, so the weekly job can never observe a
          // recommendation without also observing its shopping-list item.
          const cropsNeedingPurchase = validRecommendations.filter(({ r }) => r.requiresPurchase);
          if (cropsNeedingPurchase.length > 0) {
            const existingCropItems = await tx
              .select({ cropId: shoppingListItems.cropId })
              .from(shoppingListItems)
              .where(
                and(
                  eq(shoppingListItems.userId, userId),
                  inArray(
                    shoppingListItems.cropId,
                    cropsNeedingPurchase.map(({ r }) => cropIdBySlug[r.cropSlug]),
                  ),
                ),
              );
            const alreadyListedCropIds = new Set(existingCropItems.map((i) => i.cropId));
            const newCropItems = cropsNeedingPurchase.filter(
              ({ r }) => !alreadyListedCropIds.has(cropIdBySlug[r.cropSlug]),
            );
            if (newCropItems.length > 0) {
              await tx.insert(shoppingListItems).values(
                newCropItems.map(({ r }) => ({
                  tenantId,
                  userId,
                  cropId: cropIdBySlug[r.cropSlug],
                  quantityLabel: "1 packet",
                  source: "ai" as const,
                })),
              );
            }
          }

          // Purchasable growing-space equipment (pots/trays/planters/raised
          // beds — deliberately not the watering can, a tool rather than
          // growing space, and deliberately not garden beds, which aren't a
          // product at all, just ground in the user's own garden) the user
          // owns none of. Not crop-specific: no crop->equipment mapping
          // exists in this schema, so this is "growing needs equipment,
          // surfaced now" not a claim about what any particular recommended
          // crop requires.
          const [tenantGrowingEquipmentTypes, ownedEquipment, existingEquipmentItems] = await Promise.all([
            tx.select().from(equipmentTypes).where(inArray(equipmentTypes.slug, PURCHASABLE_GROWING_SPACE_SLUGS)),
            tx
              .select({ equipmentTypeId: userEquipment.equipmentTypeId })
              .from(userEquipment)
              .where(eq(userEquipment.userId, userId)),
            tx
              .select({ equipmentTypeId: shoppingListItems.equipmentTypeId })
              .from(shoppingListItems)
              .where(eq(shoppingListItems.userId, userId)),
          ]);
          const ownedEquipmentTypeIds = new Set(ownedEquipment.map((e) => e.equipmentTypeId));
          const alreadyListedEquipmentTypeIds = new Set(
            existingEquipmentItems.map((i) => i.equipmentTypeId).filter(Boolean),
          );
          const missingEquipmentTypes = tenantGrowingEquipmentTypes.filter(
            (t) => !ownedEquipmentTypeIds.has(t.id) && !alreadyListedEquipmentTypeIds.has(t.id),
          );
          if (missingEquipmentTypes.length > 0) {
            await tx.insert(shoppingListItems).values(
              missingEquipmentTypes.map((t) => ({
                tenantId,
                userId,
                equipmentTypeId: t.id,
                quantityLabel: "1",
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
