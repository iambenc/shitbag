import "server-only";
import { z } from "zod";
import { generateObject } from "ai";
import { getModelForTenant } from "@/lib/ai/provider";
import { cropCategoryEnum } from "@/db/schema";

export const CropFactsOutputSchema = z.object({
  name: z
    .string()
    .describe(
      "The crop's correct, standard common name — proper capitalization and spelling, singular, e.g. \"Tomato\" or \"Swiss Chard\" — even if the requested name had a typo, unusual casing, or was plural. This is what gets stored in the shared crop catalog other users will see and search, so it must be the genuinely correct name, not just an echo of whatever was asked for.",
    ),
  category: z.enum(cropCategoryEnum),
  emoji: z.string(),
  spacingCm: z.number().int().positive(),
  soilDepthCm: z.number().int().positive(),
  sowIndoorFromMonth: z.number().int().min(1).max(12).nullable(),
  sowIndoorToMonth: z.number().int().min(1).max(12).nullable(),
  sowOutdoorFromMonth: z.number().int().min(1).max(12).nullable(),
  sowOutdoorToMonth: z.number().int().min(1).max(12).nullable(),
  daysToHarvestMin: z.number().int().positive(),
  daysToHarvestMax: z.number().int().positive(),
  supportsSuccessionSowing: z.boolean(),
  estimatedRetailPricePerKgGbp: z.number().positive(),
  feedingNotes: z.string().nullable(),
});
export type CropFactsOutput = z.infer<typeof CropFactsOutputSchema>;

export type CropFactsResult = {
  output: CropFactsOutput;
  provider: string;
  model: string;
};

function buildPrompt(cropName: string): string {
  return `You are an expert UK fruit-and-vegetable gardening advisor. A gardener wants to grow "${cropName}", a crop that isn't in our reference catalog yet. Provide accurate, practical planting facts for growing it in a home garden in the UK.

Respond with:
- name: the crop's correct common name, properly capitalized and spelled, singular (e.g. "Tomato", "Swiss Chard") — correct any typo, casing, or pluralization in "${cropName}" rather than repeating it verbatim; this is what gets saved to a shared catalog other gardeners will see
- category: fruit, vegetable, or herb
- emoji: a single emoji that best represents this crop
- spacingCm: recommended spacing between plants, in cm
- soilDepthCm: recommended sowing depth, in cm
- sowIndoorFromMonth/sowIndoorToMonth: month numbers (1-12) for the indoor sowing window, or null if this crop isn't typically started indoors
- sowOutdoorFromMonth/sowOutdoorToMonth: month numbers (1-12) for the outdoor sowing window, or null if this crop isn't typically sown outdoors directly
- daysToHarvestMin/daysToHarvestMax: typical days from sowing to harvest
- supportsSuccessionSowing: true if sowing this in batches every few weeks is a common technique to avoid a glut
- estimatedRetailPricePerKgGbp: your best estimate of this crop's typical UK supermarket retail price, in GBP per kg (or the kg-equivalent, for crops normally sold by bunch/head/unit rather than by weight) — used to help prioritise growing crops that are relatively expensive to buy
- feedingNotes: brief feeding guidance, or null if this crop needs no particular feeding`;
}

/**
 * Looks up planting facts for a crop not yet in the `crops` catalog. Callers
 * are responsible for persisting the result (this agent has no DB access) —
 * see generateGrowPlan.ts's resolve-new-crops step, the only caller today.
 */
export async function getCropFacts(tenantId: string, cropName: string): Promise<CropFactsResult> {
  const resolved = await getModelForTenant(tenantId, "crop_facts");

  if (resolved) {
    const { object } = await generateObject({
      model: resolved.model,
      schema: CropFactsOutputSchema,
      prompt: buildPrompt(cropName),
    });
    return { output: object, provider: resolved.provider, model: resolved.modelId };
  }

  return { output: buildMockCropFacts(cropName), provider: "mock", model: "mock-crop-facts-v1" };
}

/**
 * No AI key configured — same dev-mode fallback pattern as every other
 * agent. Unlike those, this output gets persisted permanently into the
 * shared crops catalog, so the caller also stamps provider/model "mock" on
 * the row, not just this text label. Can't actually correct spelling
 * without a real model — this only title-cases whatever was typed, a
 * best-effort stand-in for the real "name" field's spelling-correction job.
 */
function buildMockCropFacts(cropName: string): CropFactsOutput {
  const name = cropName
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    name,
    category: "vegetable",
    emoji: "🌱",
    spacingCm: 30,
    soilDepthCm: 2,
    sowIndoorFromMonth: 3,
    sowIndoorToMonth: 4,
    sowOutdoorFromMonth: 4,
    sowOutdoorToMonth: 6,
    daysToHarvestMin: 60,
    daysToHarvestMax: 90,
    supportsSuccessionSowing: false,
    // Neutral placeholder, same fixed-value convention as the rest of this
    // mock — not a real estimate for any specific crop.
    estimatedRetailPricePerKgGbp: 5.0,
    feedingNotes: `[Mock crop facts for "${cropName}" — connect a Gemini API key for real data.]`,
  };
}
