import "server-only";
import { z } from "zod";
import { generateObject } from "ai";
import { getModelForTenant } from "@/lib/ai/provider";

export const GrowPlanOutputSchema = z.object({
  summary: z.string(),
  recommendations: z
    .array(
      z.object({
        cropSlug: z.string(),
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
      }),
    )
    .min(1)
    .max(40),
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
  growingAreaCounts: { type: string; count: number }[];
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

function buildPrompt(input: GrowPlannerInput): string {
  const { profile, growingAreaCounts, ownedSeedCropSlugs, favoriteCropSlugs, dislikedCropSlugs, harvestHistory } =
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

GROWING SPACE (totals, not assigned to specific recommendations yet)
${growingAreaCounts.length ? growingAreaCounts.map((g) => `- ${g.count}x ${g.type}`).join("\n") : "- none recorded yet"}

SEEDS ALREADY OWNED (prioritise these; anything else needed should be flagged requiresPurchase)
${ownedSeedCropSlugs.length ? ownedSeedCropSlugs.join(", ") : "none"}

FAVOURITE CROPS (prefer these where they fit the space/season)
${favoriteCropSlugs.length ? favoriteCropSlugs.join(", ") : "none specified"}

DISLIKED CROPS (avoid recommending these)
${dislikedCropSlugs.length ? dislikedCropSlugs.join(", ") : "none"}

PRIOR HARVEST HISTORY (use to judge whether to recommend the same crop again)
${harvestHistory.length ? harvestHistory.map((h) => `- ${h.cropSlug}: ${h.quantity}${h.unit} on ${h.harvestedAt}`).join("\n") : "- no history yet"}

AVAILABLE CROP CATALOG (only recommend crops from this list, referenced by slug)
${input.availableCrops
  .map(
    (c) =>
      `- ${c.slug}: spacing ${c.spacingCm}cm, soil depth ${c.soilDepthCm}cm, indoor sow months ${c.sowIndoorFromMonth ?? "-"}-${c.sowIndoorToMonth ?? "-"}, outdoor sow months ${c.sowOutdoorFromMonth ?? "-"}-${c.sowOutdoorToMonth ?? "-"}, days to harvest ${c.daysToHarvestMin}-${c.daysToHarvestMax}, succession sowing: ${c.supportsSuccessionSowing}, feeding: ${c.feedingNotes ?? "none"}`,
  )
  .join("\n")}

INSTRUCTIONS
1. Recommend crops that will thrive given the space, sunlight, and season (relative to today's date and the sow-month windows above). Prioritise owned seeds; anything else needed must be marked requiresPurchase: true.
2. Explain your reasoning per recommendation, in language appropriate to the user's expertise level.
3. Generate tasks (sowing, feeding where feeding notes exist, and — for crops that support succession sowing — a re-sow task to keep a continuous crop) each with an explanation of why/when and an absolute last date (hardDeadlineDate) after which it's too late.
4. If indoor seedling space is available, prefer earlier indoor sowing where the crop's indoor window allows it.
5. Stagger estimatedHarvestStart/End across recommendations where possible so harvests don't all land at once (avoid a glut).
6. Use prior harvest history to judge whether a crop is worth recommending again.
7. Write a short overall "summary" explaining the plan at a level matching the user's expertise.`;
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
  const rest = input.availableCrops.filter(
    (c) => !favorites.some((f) => f.slug === c.slug) && !disliked.has(c.slug),
  );
  const picked = [...favorites, ...rest].slice(0, 5);

  const today = new Date(input.today);
  function addDays(days: number): string {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  const expertise = input.profile.expertiseLevel ?? "beginner";
  const recommendations = picked.map((crop, i) => {
    const requiresPurchase = !owned.has(crop.slug);
    return {
      cropSlug: crop.slug,
      reasoning: `${crop.name} suits a ${input.profile.plotSize ?? "small"} plot with your ${expertise} experience level. ${
        requiresPurchase
          ? "You'll need to add seeds to your shopping list for this one."
          : "You already have seeds for this, so it's ready to go."
      } [Mock plan — connect a Gemini API key for real AI-generated recommendations.]`,
      requiresPurchase,
      estimatedHarvestStart: addDays(crop.daysToHarvestMin + i * 5),
      estimatedHarvestEnd: addDays(crop.daysToHarvestMax + i * 5),
    };
  });

  const tasks = picked.flatMap((crop, i) => {
    const cropTasks = [
      {
        cropSlug: crop.slug,
        title: `Sow ${crop.name}`,
        explanation: `Space ${crop.name} at ${crop.spacingCm}cm with ${crop.soilDepthCm}cm of soil depth. Based on your local conditions, sow soon for the best start.`,
        dueDate: addDays(i),
        hardDeadlineDate: addDays(14 + i),
      },
    ];
    if (crop.feedingNotes) {
      cropTasks.push({
        cropSlug: crop.slug,
        title: `Feed ${crop.name}`,
        explanation: crop.feedingNotes,
        dueDate: addDays(30 + i * 5),
        hardDeadlineDate: addDays(45 + i * 5),
      });
    }
    if (crop.supportsSuccessionSowing) {
      cropTasks.push({
        cropSlug: crop.slug,
        title: `Re-sow ${crop.name} for a continuous crop`,
        explanation: `${crop.name} supports succession sowing — sow another batch now to keep a steady harvest rather than one big glut.`,
        dueDate: addDays(21 + i * 5),
        hardDeadlineDate: addDays(35 + i * 5),
      });
    }
    return cropTasks;
  });

  return {
    summary: `Mock plan for a ${input.profile.plotSize ?? "your"} plot (${expertise} level): ${picked.length} crops staggered to avoid harvesting everything at once. Connect a Gemini API key (GOOGLE_GENERATIVE_AI_API_KEY) for a real AI-generated plan.`,
    recommendations,
    tasks,
  };
}
