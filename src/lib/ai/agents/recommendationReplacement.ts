import "server-only";
import { z } from "zod";
import { generateObject } from "ai";
import { getModelForTenant } from "@/lib/ai/provider";
import type { AvailableCrop } from "@/lib/ai/agents/growPlanner";

export const RecommendationReplacementOutputSchema = z.object({
  cropSlug: z.string(),
  newCropName: z
    .string()
    .nullable()
    .describe(
      "Set only when cropSlug isn't in the provided catalog: the crop's real display name, e.g. \"Swiss Chard\" for cropSlug \"swiss-chard\". Null for catalog crops.",
    ),
  reasoning: z.string(),
  requiresPurchase: z.boolean(),
  estimatedHarvestStart: z.string(),
  estimatedHarvestEnd: z.string(),
  tasks: z
    .array(
      z.object({
        title: z.string(),
        explanation: z.string(),
        dueDate: z.string(),
        hardDeadlineDate: z.string().nullable(),
        activatesStageIndex: z
          .number()
          .int()
          .min(1)
          .max(2)
          .nullable()
          .describe(
            "Set only on a transplant task — the 1-based index (within STAGE SHAPE below) of the stage this task moves the crop into. Null for every other task (sowing, feeding, succession sowing).",
          ),
        isIndoor: z
          .boolean()
          .describe(
            "True only for a task that sows/plants something indoors (e.g. into a seed tray) ahead of its outdoor season. False for everything else.",
          ),
        isSuccessionResow: z
          .boolean()
          .describe(
            "True only for a repeat/re-sow occurrence of a succession-sowing crop (one of several batches sown a few weeks apart to keep a continuous harvest). False for every other task, including this crop's own first/original sowing.",
          ),
        estimatedSeedsUsed: z
          .number()
          .int()
          .positive()
          .nullable()
          .describe(
            "Set only on a task that sows/plants seeds — the crop's first sowing, and any succession re-sow task. Your best estimate of how many seeds that specific sowing needs, based on stage 1's size (from STAGE SHAPE) divided by the crop's spacingCm, plus roughly a 20-30% margin for germination failure. Null for every other task (feeding, transplanting).",
          ),
      }),
    )
    .min(1)
    .max(14),
});
export type RecommendationReplacementOutput = z.infer<typeof RecommendationReplacementOutputSchema>;

export type StageShape = {
  type: string;
  sizeValue: number | null;
  sizeUnit: "cm" | "litres" | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
};

export type RecommendationReplacementInput = {
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
  // One representative stage sequence — every rejected instance in the group
  // shares this shape by construction (that's why they were grouped), so the
  // AI only needs to reason about it once, not once per instance.
  stageShape: StageShape[];
  instanceCount: number;
  excludedCropSlugs: string[];
  ownedSeedCropSlugs: string[];
  favoriteCropSlugs: string[];
  dislikedCropSlugs: string[];
  harvestHistory: { cropSlug: string; quantity: number; unit: string; harvestedAt: string }[];
  availableCrops: AvailableCrop[];
};

export type RecommendationReplacementResult = {
  output: RecommendationReplacementOutput;
  provider: string;
  model: string;
};

function stageShapeText(stages: StageShape[]): string {
  return stages
    .map((s, i) => {
      const size = s.sizeValue
        ? `${s.sizeValue}${s.sizeUnit === "litres" ? "L" : "cm"}`
        : s.widthCm && s.lengthCm
          ? `${s.widthCm}x${s.lengthCm}${s.depthCm ? `x${s.depthCm}` : ""}cm`
          : "size unknown";
      return `- stage ${i + 1}: ${s.type}, ${size}`;
    })
    .join("\n");
}

function buildPrompt(input: RecommendationReplacementInput): string {
  const { profile, stageShape, instanceCount, excludedCropSlugs, ownedSeedCropSlugs, favoriteCropSlugs, dislikedCropSlugs, harvestHistory } =
    input;

  return `You are an expert UK fruit-and-vegetable gardening advisor. Today's date is ${input.today}. The user rejected a previous recommendation and wants a replacement.

USER PROFILE
- Postcode: ${profile.postcode ?? "unknown"}
- Plot size: ${profile.plotSize ?? "unknown"}
- Average daily sunlight: ${profile.avgSunlightHours ?? "unknown"} hours
- Household size: ${profile.householdSize ?? "unknown"}
- Expertise level: ${profile.expertiseLevel ?? "beginner"} — tailor explanation depth/tone to this
- Indoor seedling space available: ${profile.hasIndoorSeedlingSpace ? "yes" : "no"}
- Time available: ${profile.weekdayHoursAvailable ?? "unknown"}h/weekday, ${profile.weekendHoursAvailable ?? "unknown"}h/weekend day

STAGE SHAPE (fixed — you are choosing what crop grows here, not where; this exact sequence of growing-area stages is already reserved and cannot change)
${stageShapeText(stageShape)}
${instanceCount > 1 ? `\nThere are ${instanceCount} identical instances of this exact stage shape to fill, all with the SAME crop — recommend one crop and one task plan; it will be applied identically to each instance.` : ""}

DO NOT RECOMMEND (already rejected, or already growing elsewhere in this plan)
${excludedCropSlugs.length ? excludedCropSlugs.join(", ") : "none"}

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
1. Recommend one crop that fits STAGE SHAPE above and isn't in DO NOT RECOMMEND. Prioritise owned seeds; anything else needed must be marked requiresPurchase: true.
2. Maximise the household's value return: among viable candidates, prefer one with a higher estimated retail cost (est. retail £/kg in the catalog above) — growing a high-cost-to-buy crop saves the user more money than growing a cheap staple they could buy inexpensively anyway. This is secondary to fit, exclusions, owned seeds, favourites, dislikes, and harvest history — never pick a crop just because it's expensive if it's a worse fit than another candidate.
3. Explain your reasoning, in language appropriate to the user's expertise level.
4. Generate tasks (sowing, feeding where feeding notes exist, and transplanting where relevant) each with an explanation of why/when and an absolute last date (hardDeadlineDate) after which it's too late. If STAGE SHAPE has more than one stage, add a transplant task for each stage after the first, with activatesStageIndex set to that stage's 1-based index (e.g. 1 for the second stage). Leave activatesStageIndex null on every other task. Mark isIndoor true on the sowing task if it starts the crop in a seed tray (or otherwise indoors) ahead of its outdoor season.
5. If this crop supports succession sowing, ALWAYS generate at least 2 re-sow tasks — never just one, a single re-sow defeats the point of succession sowing. Use up to 5 for a crop with a long outdoor sowing window (4+ months, e.g. radish, carrot), and at least 2-3 even for a shorter window (~2 months). Space them roughly 2-3 weeks apart, each still falling within that crop's outdoor sowing window and before the growing season realistically ends. Mark isSuccessionResow: true on every one of these re-sow tasks, and false on every other task (including this crop's own first/original sowing).
6. Use prior harvest history to judge whether a crop is worth recommending again.
7. On every task that sows or plants seeds (the crop's first sowing and any succession re-sow), set estimatedSeedsUsed to your best-guess seed count for that specific sowing — stage 1's size divided by the crop's spacingCm, plus a 20-30% margin for germination failure. Leave it null on every other task (feeding, transplanting).
8. If a crop you'd genuinely recommend isn't in the catalog above, you may propose it: set newCropName to its common name and give it a lowercase-hyphenated cropSlug, used identically in this recommendation and its tasks. Only propose well-established, common home-garden crops you're confident about. Leave newCropName null for every crop already in the catalog.`;
}

export async function generateRecommendationReplacement(
  tenantId: string,
  input: RecommendationReplacementInput,
): Promise<RecommendationReplacementResult> {
  const resolved = await getModelForTenant(tenantId, "grow_planner");

  if (resolved) {
    const { object } = await generateObject({
      model: resolved.model,
      schema: RecommendationReplacementOutputSchema,
      prompt: buildPrompt(input),
    });
    return { output: object, provider: resolved.provider, model: resolved.modelId };
  }

  return { output: buildMockReplacement(input), provider: "mock", model: "mock-recommendation-replacement-v1" };
}

/**
 * No AI key configured — same dev-mode fallback pattern as every other
 * agent. Deterministically picks the first available-crop candidate not in
 * excludedCropSlugs, and exercises every field of the schema (including a
 * transplant task per stage after the first) so this path is fully testable
 * without a live key.
 */
function buildMockReplacement(input: RecommendationReplacementInput): RecommendationReplacementOutput {
  const excluded = new Set(input.excludedCropSlugs);
  const owned = new Set(input.ownedSeedCropSlugs);
  const disliked = new Set(input.dislikedCropSlugs);
  const favorites = input.availableCrops.filter(
    (c) => input.favoriteCropSlugs.includes(c.slug) && !disliked.has(c.slug) && !excluded.has(c.slug),
  );
  // Sorted by estimated retail cost descending, same value-preferring
  // demonstration as growPlanner.ts's own mock — favorites still take
  // priority, this only orders the non-favorite fallback pool.
  const rest = input.availableCrops
    .filter((c) => !favorites.some((f) => f.slug === c.slug) && !disliked.has(c.slug) && !excluded.has(c.slug))
    .sort((a, b) => b.estimatedRetailPricePerKgGbp - a.estimatedRetailPricePerKgGbp);
  const crop = favorites[0] ?? rest[0];

  const today = new Date(input.today);
  function addDays(days: number): string {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const expertise = input.profile.expertiseLevel ?? "beginner";
  // Same deterministic stand-in as growPlanner.ts's own mock — most stage
  // shapes carry no widthCm/lengthCm (pots/trays given as a diameter or
  // litres), so this falls back to a plausible small-batch count scaled
  // loosely by spacing rather than pretending to do real geometry.
  function estimateSeeds(crop: AvailableCrop): number {
    const stage = input.stageShape[0];
    if (stage?.widthCm && stage?.lengthCm) {
      const cols = Math.max(1, Math.floor(stage.widthCm / crop.spacingCm));
      const rows = Math.max(1, Math.floor(stage.lengthCm / crop.spacingCm));
      return Math.ceil(cols * rows * 1.25);
    }
    return Math.max(3, Math.round(300 / crop.spacingCm));
  }

  if (!crop) {
    // No candidate left to recommend (every catalog crop is somehow
    // excluded/disliked) — fall back to a synthetic new crop, same as the
    // main planner's mock does when it wants to exercise the new-crop path.
    const stages = input.stageShape;
    const tasks: RecommendationReplacementOutput["tasks"] = [
      {
        title: "Sow Swiss Chard",
        explanation:
          "Swiss Chard is a new addition to the catalog via this mock replacement. [Mock plan — connect a Gemini API key for real AI-generated recommendations.]",
        dueDate: addDays(0),
        hardDeadlineDate: addDays(14),
        activatesStageIndex: null,
        isIndoor: false,
        isSuccessionResow: false,
        // Swiss Chard isn't a real catalog crop here (no spacingCm to divide
        // by) — a plausible fixed count for this synthetic mock-only demo.
        estimatedSeedsUsed: 8,
      },
    ];
    for (let i = 1; i < stages.length; i++) {
      tasks.push({
        title: `Move your Swiss Chard on (stage ${i + 1})`,
        explanation: "Move it to its next growing space once established.",
        dueDate: addDays(21 * i),
        hardDeadlineDate: addDays(21 * i + 14),
        activatesStageIndex: i,
        isIndoor: false,
        isSuccessionResow: false,
        estimatedSeedsUsed: null,
      });
    }
    return {
      cropSlug: "swiss-chard",
      newCropName: "Swiss Chard",
      reasoning: `Swiss Chard isn't in your usual catalog yet, but it's a reliable, colourful leafy green that suits a ${input.profile.plotSize ?? "small"} plot. [Mock plan — connect a Gemini API key for real AI-generated recommendations.]`,
      requiresPurchase: true,
      estimatedHarvestStart: addDays(55),
      estimatedHarvestEnd: addDays(65),
      tasks,
    };
  }

  const requiresPurchase = !owned.has(crop.slug);
  const stages = input.stageShape;
  const tasks: RecommendationReplacementOutput["tasks"] = [
    {
      title: `Sow ${crop.name}`,
      explanation: `Space ${crop.name} at ${crop.spacingCm}cm with ${crop.soilDepthCm}cm of soil depth. Based on your local conditions, sow soon for the best start.`,
      dueDate: addDays(0),
      hardDeadlineDate: addDays(14),
      activatesStageIndex: null,
      isIndoor: false,
      isSuccessionResow: false,
      estimatedSeedsUsed: estimateSeeds(crop),
    },
  ];
  for (let i = 1; i < stages.length; i++) {
    tasks.push({
      title: `Move your ${crop.name} on (stage ${i + 1})`,
      explanation: `Move ${crop.name} to its next growing space once established.`,
      dueDate: addDays(21 * i),
      hardDeadlineDate: addDays(21 * i + 14),
      activatesStageIndex: i,
      isIndoor: false,
      isSuccessionResow: false,
      estimatedSeedsUsed: null,
    });
  }
  if (crop.feedingNotes) {
    tasks.push({
      title: `Feed ${crop.name}`,
      explanation: crop.feedingNotes,
      dueDate: addDays(30),
      hardDeadlineDate: addDays(45),
      activatesStageIndex: null,
      isIndoor: false,
      isSuccessionResow: false,
      estimatedSeedsUsed: null,
    });
  }
  if (crop.supportsSuccessionSowing) {
    // 3 staggered re-sows — closes the previous inconsistency where this
    // mock generated none at all, unlike growPlanner.ts's own mock.
    for (let s = 0; s < 3; s++) {
      tasks.push({
        title: `Re-sow ${crop.name} for a continuous crop`,
        explanation: `${crop.name} supports succession sowing — sow another batch now to keep a steady harvest rather than one big glut.`,
        dueDate: addDays(21 + s * 14),
        hardDeadlineDate: addDays(35 + s * 14),
        activatesStageIndex: null,
        isIndoor: false,
        isSuccessionResow: true,
        estimatedSeedsUsed: estimateSeeds(crop),
      });
    }
  }

  return {
    cropSlug: crop.slug,
    newCropName: null,
    reasoning: `${crop.name} suits a ${input.profile.plotSize ?? "small"} plot with your ${expertise} experience level. ${
      requiresPurchase
        ? "You'll need to add seeds to your shopping list for this one."
        : "You already have seeds for this, so it's ready to go."
    } [Mock plan — connect a Gemini API key for real AI-generated recommendations.]`,
    requiresPurchase,
    estimatedHarvestStart: addDays(crop.daysToHarvestMin),
    estimatedHarvestEnd: addDays(crop.daysToHarvestMax),
    tasks,
  };
}
