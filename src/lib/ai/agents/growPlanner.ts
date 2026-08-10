import "server-only";
import { z } from "zod";
import { generateObject } from "ai";
import { getModelForTenant } from "@/lib/ai/provider";
import { formatSizeValue } from "@/lib/garden/labels";
import type { SizeUnit } from "@/db/schema";

export const GrowPlanOutputSchema = z.object({
  summary: z.string(),
  recommendations: z
    .array(
      z.object({
        cropSlug: z.string(),
        newCropName: z
          .string()
          .nullable()
          .describe(
            "Set only when cropSlug isn't in the provided catalog: the crop's real display name, e.g. \"Swiss Chard\" for cropSlug \"swiss-chard\". Null for catalog crops.",
          ),
        stages: z
          .array(z.object({ growingAreaId: z.string() }))
          .min(1)
          .max(3)
          .describe(
            "Every growing area this crop occupies over its life, in order from first (where it's sown/started) to final. Usually just 1 entry (sown directly in its final growing space). Use 2 or 3 only when this crop genuinely benefits from starting in a seed tray or pot before its final growing space, and only when suitable areas of each needed type are actually available. Each growingAreaId must be a real, distinct id from AVAILABLE GROWING AREAS TO FILL — never invent one, never reuse one across two stages or two recommendations.",
          ),
        reasoning: z.string(),
        requiresPurchase: z.boolean(),
        estimatedHarvestStart: z.string(),
        estimatedHarvestEnd: z.string(),
      }),
    )
    .min(1)
    .max(12),
  tasks: z
    .array(
      z.object({
        cropSlug: z.string().nullable(),
        title: z.string(),
        explanation: z.string(),
        dueDate: z.string(),
        hardDeadlineDate: z.string().nullable(),
        activatesGrowingAreaId: z
          .string()
          .nullable()
          .describe(
            "Set only on the task that transplants this crop INTO a later stage — the growingAreaId of that stage, from this crop's own `stages` list (index 1 or later). Null for every other task (sowing, feeding, succession sowing).",
          ),
        isIndoor: z
          .boolean()
          .describe(
            "True only for a task that sows/plants something indoors (e.g. into a seed tray) ahead of its outdoor season. False for everything else — outdoor sowing, feeding, succession sowing, transplanting out, etc.",
          ),
        isSuccessionResow: z
          .boolean()
          .describe(
            "True only for a repeat/re-sow occurrence of a succession-sowing crop (one of several batches sown a few weeks apart to keep a continuous harvest). False for every other task, including that crop's own first/original sowing.",
          ),
        recommendationIndex: z
          .number()
          .int()
          .min(0)
          .describe(
            "The 0-based position of this task's crop within the `recommendations` array above (0 for the first entry, 1 for the second, etc). Required on every task so it can be matched to the specific recommendation it belongs to — this matters most when the same crop appears in more than one recommendation (e.g. two separate lettuce beds), whose tasks must never be mixed up.",
          ),
      }),
    )
    .min(1)
    .max(90),
});
export type GrowPlanOutput = z.infer<typeof GrowPlanOutputSchema>;

export type AvailableCrop = {
  slug: string;
  name: string;
  category: string;
  spacingCm: number;
  soilDepthCm: number;
  sowIndoorFromMonth: number | null;
  sowIndoorToMonth: number | null;
  sowOutdoorFromMonth: number | null;
  sowOutdoorToMonth: number | null;
  daysToHarvestMin: number;
  daysToHarvestMax: number;
  supportsSuccessionSowing: boolean;
  estimatedRetailPricePerKgGbp: number;
  feedingNotes: string | null;
};

export type GrowPlannerInput = {
  today: string;
  profile: {
    postcode: string | null;
    plotSize: string | null;
    avgSunlightHours: number | null;
    householdSize: number | null;
    expertiseLevel: string | null;
    hasIndoorSeedlingSpace: boolean | null;
    weekdayHoursAvailable: number | null;
    weekendHoursAvailable: number | null;
  };
  growingAreas: {
    id: string;
    type: string;
    sizeValue: number | null;
    sizeUnit: SizeUnit | null;
    widthCm: number | null;
    lengthCm: number | null;
    depthCm: number | null;
  }[];
  unplacedEquipment: { type: string; count: number }[];
  ownedSeedCropSlugs: string[];
  favoriteCropSlugs: string[];
  dislikedCropSlugs: string[];
  harvestHistory: { cropSlug: string; quantity: number; unit: string; harvestedAt: string }[];
  availableCrops: AvailableCrop[];
};

export type GrowPlanResult = {
  output: GrowPlanOutput;
  provider: string;
  model: string;
};

function areaSizeText(area: GrowPlannerInput["growingAreas"][number]): string {
  const sized = formatSizeValue(area.sizeValue, area.sizeUnit);
  if (sized) return sized;
  if (area.widthCm && area.lengthCm) {
    return `${area.widthCm}x${area.lengthCm}${area.depthCm ? `x${area.depthCm}` : ""}cm`;
  }
  return "size unknown";
}

function buildPrompt(input: GrowPlannerInput): string {
  const { profile, growingAreas, unplacedEquipment, ownedSeedCropSlugs, favoriteCropSlugs, dislikedCropSlugs, harvestHistory } =
    input;

  return `You are an expert UK fruit-and-vegetable gardening advisor. Today's date is ${input.today}.

USER PROFILE
- Postcode: ${profile.postcode ?? "unknown"}
- Plot size: ${profile.plotSize ?? "unknown"}
- Average daily sunlight: ${profile.avgSunlightHours ?? "unknown"} hours
- Household size: ${profile.householdSize ?? "unknown"}
- Expertise level: ${profile.expertiseLevel ?? "beginner"} — tailor explanation depth/tone to this
- Indoor seedling space available: ${profile.hasIndoorSeedlingSpace ? "yes" : "no"}
- Time available: ${profile.weekdayHoursAvailable ?? "unknown"}h/weekday, ${profile.weekendHoursAvailable ?? "unknown"}h/weekend day

AVAILABLE GROWING AREAS TO FILL (assign a sequence of one or more of these to each recommendation's stages, by id; never invent an id, never reuse one across two stages or two recommendations, and never claim more areas in total than are listed here)
${growingAreas.length ? growingAreas.map((a) => `- id ${a.id}: ${a.type}, ${areaSizeText(a)}`).join("\n") : "- none available"}

EQUIPMENT OWNED BUT NOT YET PLACED AS GROWING SPACE (mention in the summary if placing it would let the user grow more — don't assign recommendations to it, it isn't a growing area yet)
${unplacedEquipment.length ? unplacedEquipment.map((e) => `- ${e.count}x ${e.type}`).join("\n") : "- none"}

SEEDS ALREADY OWNED (prioritise these; anything else needed should be flagged requiresPurchase)
${ownedSeedCropSlugs.length ? ownedSeedCropSlugs.join(", ") : "none"}

FAVOURITE CROPS (prefer these where they fit the space/season)
${favoriteCropSlugs.length ? favoriteCropSlugs.join(", ") : "none specified"}

DISLIKED CROPS (avoid recommending these)
${dislikedCropSlugs.length ? dislikedCropSlugs.join(", ") : "none"}

PRIOR HARVEST HISTORY (use to judge whether to recommend the same crop again)
${harvestHistory.length ? harvestHistory.map((h) => `- ${h.cropSlug}: ${h.quantity}${h.unit} on ${h.harvestedAt}`).join("\n") : "- no history yet"}

AVAILABLE CROP CATALOG (prefer these, referenced by slug)
${input.availableCrops
  .map(
    (c) =>
      `- ${c.slug}: spacing ${c.spacingCm}cm, soil depth ${c.soilDepthCm}cm, indoor sow months ${c.sowIndoorFromMonth ?? "-"}-${c.sowIndoorToMonth ?? "-"}, outdoor sow months ${c.sowOutdoorFromMonth ?? "-"}-${c.sowOutdoorToMonth ?? "-"}, days to harvest ${c.daysToHarvestMin}-${c.daysToHarvestMax}, succession sowing: ${c.supportsSuccessionSowing}, est. retail £${c.estimatedRetailPricePerKgGbp.toFixed(2)}/kg, feeding: ${c.feedingNotes ?? "none"}`,
  )
  .join("\n")}

INSTRUCTIONS
1. Recommend crops that will thrive given the space, sunlight, and season (relative to today's date and the sow-month windows above). Prioritise owned seeds; anything else needed must be marked requiresPurchase: true.
2. Maximise the household's value return: where several crops would suit the same space and season roughly equally well, prefer the one with a higher estimated retail cost (est. retail £/kg in the catalog above) — growing high-cost-to-buy crops (soft fruit, fresh herbs, specialty salad leaves) saves the user more money than growing cheap staples (potatoes, onions, cabbage) they could buy inexpensively anyway. This is secondary to genuine fit, season, owned seeds, favourites, and dislikes — never recommend a crop that's a poor fit, out of season, disliked, or unsuited to the available space just because it's expensive to buy. Where cost was a meaningful factor in a choice, you may briefly note the value angle in that recommendation's reasoning.
3. Decide, per crop, how many growing-area stages it needs — most just need one (sown directly in its final growing space, exactly what "stages" with a single entry means). Some crops, especially ones with an indoor sowing window (sowIndoorFromMonth/ToMonth set in the catalog), are better started in a seed tray or pot before moving to their final growing space — for these, list every stage in order from where it starts to its final home (2 or 3 entries). Only use more than one stage when you actually have suitable areas of each needed type available — never invent a stage there's no real space for. Prefer matching a crop's spacingCm/soilDepthCm to an area's dimensions where both are known (e.g. don't put a deep-rooted crop in a shallow tray) — a pot's size may be given as a diameter in cm or a volume in litres (L); for a litres figure, use general horticultural judgement for fit (roughly: ~1-2L suits small herbs/seedlings, ~5-10L suits most vegetables, 15L+ suits larger plants) rather than comparing it arithmetically against spacingCm/soilDepthCm, which only makes sense for a cm diameter. Every area must still get used by some stage of some recommendation if there's a reasonable crop for it — don't leave areas unused just because the fit isn't perfect. If there are no available growing areas, produce no recommendations.
4. Explain your reasoning per recommendation, in language appropriate to the user's expertise level.
5. Generate tasks (sowing, feeding where feeding notes exist, and transplanting where relevant) each with an explanation of why/when and an absolute last date (hardDeadlineDate) after which it's too late. For any crop with more than one stage, also add a transplant task for each stage after the first (e.g. "Pot on your Tomato seedlings", "Plant out your Tomato into its raised bed"), with activatesGrowingAreaId set to that stage's growing area id — completing this task is what actually moves the crop, so get its timing right relative to the previous stage. Leave activatesGrowingAreaId null on every other task. Every task must also set recommendationIndex to the 0-based position of its crop's entry in the recommendations array above.
6. For a crop that supports succession sowing, ALWAYS generate at least 2 re-sow tasks — never just one, a single re-sow defeats the point of succession sowing. Use up to 5 for a crop with a long outdoor sowing window (4+ months, e.g. radish, carrot), and at least 2-3 even for a shorter window (~2 months). Space them roughly 2-3 weeks apart, each still falling within that crop's outdoor sowing window and before the growing season realistically ends. Mark isSuccessionResow: true on every one of these re-sow tasks, and false on every other task (including that crop's own first/original sowing).
7. If indoor seedling space is available, prefer earlier indoor sowing where the crop's indoor window allows it. Mark isIndoor true on the sowing task whenever it's sowing into a seed tray (or otherwise starting the crop indoors ahead of its outdoor season) — false on every other task, including outdoor sowing and every later transplant task.
8. Stagger estimatedHarvestStart/End across recommendations where possible so harvests don't all land at once (avoid a glut).
9. Use prior harvest history to judge whether a crop is worth recommending again.
10. Write a short overall "summary" explaining the plan at a level matching the user's expertise. If EQUIPMENT OWNED BUT NOT YET PLACED lists anything, mention in the summary that placing it (via the garden page) would let the user grow more.
11. If a crop you'd genuinely recommend isn't in the catalog above, you may propose it: set newCropName to its common name (e.g. "Swiss Chard") and give it a lowercase-hyphenated cropSlug (e.g. "swiss-chard"), used identically in this recommendation and in any of its tasks. Only propose well-established, common home-garden crops you're confident about — never an obscure or fictional one. Leave newCropName null for every crop already in the catalog.`;
}

export async function generateGrowPlan(
  tenantId: string,
  input: GrowPlannerInput,
): Promise<GrowPlanResult> {
  const resolved = await getModelForTenant(tenantId, "grow_planner");

  if (resolved) {
    const { object } = await generateObject({
      model: resolved.model,
      schema: GrowPlanOutputSchema,
      prompt: buildPrompt(input),
    });
    return { output: object, provider: resolved.provider, model: resolved.modelId };
  }

  return { output: buildMockPlan(input), provider: "mock", model: "mock-grow-planner-v1" };
}

/**
 * No AI key configured anywhere (platform or tenant) — used for local dev
 * without a live Gemini key. Not trying to imitate real horticultural
 * intelligence, just exercising every field of the schema realistically so
 * the UI and data flow are genuinely tested end to end.
 */
function buildMockPlan(input: GrowPlannerInput): GrowPlanOutput {
  const owned = new Set(input.ownedSeedCropSlugs);
  const disliked = new Set(input.dislikedCropSlugs);
  const favorites = input.availableCrops.filter(
    (c) => input.favoriteCropSlugs.includes(c.slug) && !disliked.has(c.slug),
  );
  // Non-favorite candidates sorted by estimated retail cost descending —
  // demonstrates the same value-preferring selection the real prompt asks
  // for (favorites keep their existing priority/order; only the tiebreak
  // among non-favorites is by price).
  const rest = input.availableCrops
    .filter((c) => !favorites.some((f) => f.slug === c.slug) && !disliked.has(c.slug))
    .sort((a, b) => b.estimatedRetailPricePerKgGbp - a.estimatedRetailPricePerKgGbp);
  const candidates = [...favorites, ...rest];

  const today = new Date(input.today);
  function addDays(days: number): string {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const expertise = input.profile.expertiseLevel ?? "beginner";
  function reasoningFor(crop: AvailableCrop, requiresPurchase: boolean): string {
    return `${crop.name} suits a ${input.profile.plotSize ?? "small"} plot with your ${expertise} experience level. ${
      requiresPurchase
        ? "You'll need to add seeds to your shopping list for this one."
        : "You already have seeds for this, so it's ready to go."
    } [Mock plan — connect a Gemini API key for real AI-generated recommendations.]`;
  }

  // Pool of unclaimed areas grouped by type, consumed as recommendations are
  // built — mirrors the real capacity constraint persist-results enforces
  // (never claim more areas than exist, never reuse one).
  type Area = GrowPlannerInput["growingAreas"][number];
  const pool = new Map<string, Area[]>();
  for (const a of input.growingAreas) {
    const list = pool.get(a.type) ?? [];
    list.push(a);
    pool.set(a.type, list);
  }
  const FINAL_TYPES = ["raised_bed", "bed", "planter"];
  function take(types: string[]): Area | null {
    for (const t of types) {
      const list = pool.get(t);
      if (list?.length) return list.shift()!;
    }
    return null;
  }

  const recommendations: GrowPlanOutput["recommendations"] = [];
  const tasks: GrowPlanOutput["tasks"] = [];
  let candidateIndex = 0;
  let i = 0;

  // Exercises the multi-stage transplant pathway (stage areas marked
  // reserved, a transplant task wired to activate the next stage) even with
  // no live AI key — every mock path in this app should be fully testable,
  // not just the single-stage case. Only attempted when a seed tray AND a
  // final-space area are both available; the pot stage is opportunistic.
  const seedTrayArea = take(["seed_tray"]);
  if (seedTrayArea) {
    const finalArea = take(FINAL_TYPES);
    if (finalArea && candidateIndex < candidates.length) {
      const crop = candidates[candidateIndex++];
      const potArea = take(["pot"]);
      const stages = potArea
        ? [{ growingAreaId: seedTrayArea.id }, { growingAreaId: potArea.id }, { growingAreaId: finalArea.id }]
        : [{ growingAreaId: seedTrayArea.id }, { growingAreaId: finalArea.id }];
      const requiresPurchase = !owned.has(crop.slug);
      const recIndex = recommendations.length;
      recommendations.push({
        cropSlug: crop.slug,
        newCropName: null,
        stages,
        reasoning: reasoningFor(crop, requiresPurchase),
        requiresPurchase,
        estimatedHarvestStart: addDays(crop.daysToHarvestMin),
        estimatedHarvestEnd: addDays(crop.daysToHarvestMax),
      });
      tasks.push({
        cropSlug: crop.slug,
        title: `Sow ${crop.name} in a seed tray`,
        explanation: `Start ${crop.name} indoors in a seed tray at ${crop.soilDepthCm}cm depth — it'll move on to ${potArea ? "a pot, then " : ""}its final growing space once established.`,
        dueDate: addDays(0),
        hardDeadlineDate: addDays(14),
        activatesGrowingAreaId: null,
        isIndoor: true,
        isSuccessionResow: false,
        recommendationIndex: recIndex,
      });
      if (potArea) {
        tasks.push({
          cropSlug: crop.slug,
          title: `Pot on your ${crop.name} seedlings`,
          explanation: `Once your ${crop.name} seedlings have their first true leaves, move them into a pot to keep growing.`,
          dueDate: addDays(21),
          hardDeadlineDate: addDays(35),
          activatesGrowingAreaId: potArea.id,
          isIndoor: false,
          isSuccessionResow: false,
          recommendationIndex: recIndex,
        });
      }
      tasks.push({
        cropSlug: crop.slug,
        title: `Plant out your ${crop.name}`,
        explanation: `Move your ${crop.name} into its final growing space once it's established${potArea ? "" : " and the risk of frost has passed"}.`,
        dueDate: addDays(potArea ? 42 : 21),
        hardDeadlineDate: addDays(potArea ? 56 : 35),
        activatesGrowingAreaId: finalArea.id,
        isIndoor: false,
        isSuccessionResow: false,
        recommendationIndex: recIndex,
      });
      i++;
    } else {
      // No final space (or no candidate crop left) to pair it with — put it back.
      pool.get("seed_tray")!.unshift(seedTrayArea);
    }
  }

  // Remaining single-stage recommendations, one area each, capped at 5 and
  // reserving one leftover area (if any) for the synthetic new-crop demo below.
  const remainingAreas = [...pool.values()].flat();
  const singleStageSlots = Math.max(0, remainingAreas.length - 1);
  const singleStagePicked = candidates.slice(candidateIndex, candidateIndex + Math.min(5, singleStageSlots));
  for (const crop of singleStagePicked) {
    const area = remainingAreas.shift()!;
    const requiresPurchase = !owned.has(crop.slug);
    const recIndex = recommendations.length;
    recommendations.push({
      cropSlug: crop.slug,
      newCropName: null,
      stages: [{ growingAreaId: area.id }],
      reasoning: reasoningFor(crop, requiresPurchase),
      requiresPurchase,
      estimatedHarvestStart: addDays(crop.daysToHarvestMin + i * 5),
      estimatedHarvestEnd: addDays(crop.daysToHarvestMax + i * 5),
    });
    tasks.push({
      cropSlug: crop.slug,
      title: `Sow ${crop.name}`,
      explanation: `Space ${crop.name} at ${crop.spacingCm}cm with ${crop.soilDepthCm}cm of soil depth. Based on your local conditions, sow soon for the best start.`,
      dueDate: addDays(i),
      hardDeadlineDate: addDays(14 + i),
      activatesGrowingAreaId: null,
      isIndoor: false,
      isSuccessionResow: false,
      recommendationIndex: recIndex,
    });
    if (crop.feedingNotes) {
      tasks.push({
        cropSlug: crop.slug,
        title: `Feed ${crop.name}`,
        explanation: crop.feedingNotes,
        dueDate: addDays(30 + i * 5),
        hardDeadlineDate: addDays(45 + i * 5),
        activatesGrowingAreaId: null,
        isIndoor: false,
        isSuccessionResow: false,
        recommendationIndex: recIndex,
      });
    }
    if (crop.supportsSuccessionSowing) {
      // 3 staggered re-sows (not just one) — deterministic, not trying to
      // replicate real window-length reasoning the live model does.
      for (let s = 0; s < 3; s++) {
        tasks.push({
          cropSlug: crop.slug,
          title: `Re-sow ${crop.name} for a continuous crop`,
          explanation: `${crop.name} supports succession sowing — sow another batch now to keep a steady harvest rather than one big glut.`,
          dueDate: addDays(21 + i * 5 + s * 14),
          hardDeadlineDate: addDays(35 + i * 5 + s * 14),
          activatesGrowingAreaId: null,
          isIndoor: false,
          isSuccessionResow: true,
          recommendationIndex: recIndex,
        });
      }
    }
    i++;
  }

  // Exercises the new-crop backfill pathway (resolve-new-crops in
  // generateGrowPlan.ts, including cropFacts.ts's own mock fallback) even
  // with no live AI key configured. Only added if a spare area remains.
  if (remainingAreas.length > 0) {
    const area = remainingAreas.shift()!;
    const recIndex = recommendations.length;
    recommendations.push({
      cropSlug: "swiss-chard",
      newCropName: "Swiss Chard",
      stages: [{ growingAreaId: area.id }],
      reasoning: `Swiss Chard isn't in your usual catalog yet, but it's a reliable, colourful leafy green that suits a ${input.profile.plotSize ?? "small"} plot. [Mock plan — connect a Gemini API key for real AI-generated recommendations.]`,
      requiresPurchase: true,
      estimatedHarvestStart: addDays(55),
      estimatedHarvestEnd: addDays(65),
    });
    tasks.push({
      cropSlug: "swiss-chard",
      title: "Sow Swiss Chard",
      explanation:
        "Swiss Chard is a new addition to the catalog via this mock plan — sow at the recommended spacing once its crop facts are looked up. [Mock plan — connect a Gemini API key for real AI-generated recommendations.]",
      dueDate: addDays(2),
      hardDeadlineDate: addDays(16),
      activatesGrowingAreaId: null,
      isIndoor: false,
      isSuccessionResow: false,
      recommendationIndex: recIndex,
    });
  }

  return {
    summary: `Mock plan for a ${input.profile.plotSize ?? "your"} plot (${expertise} level): ${recommendations.length} crop${recommendations.length === 1 ? "" : "s"} planned, staggered to avoid harvesting everything at once. Connect a Gemini API key (GOOGLE_GENERATIVE_AI_API_KEY) for a real AI-generated plan.`,
    recommendations,
    tasks,
  };
}
