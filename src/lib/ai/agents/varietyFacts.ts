import "server-only";
import { z } from "zod";
import { generateObject } from "ai";
import { getModelForTenant } from "@/lib/ai/provider";

export const VarietyFactsOutputSchema = z.object({
  name: z
    .string()
    .describe(
      "The cultivar's correct, standard name — proper capitalization and spelling, e.g. \"Moneymaker\" or \"Gardener's Delight\" — even if the requested name had a typo or unusual casing. This is what gets stored in the shared variety catalog other users will see and search, so it must be the genuinely correct name, not just an echo of whatever was asked for.",
    ),
  // Every field below is an OVERRIDE of the parent crop's own value — only
  // fill one in when this cultivar genuinely differs from the species
  // baseline given below; leave it null to mean "same as the parent crop."
  // Don't manufacture false precision by restating the parent's own figure.
  daysToHarvestMin: z.number().int().positive().nullable(),
  daysToHarvestMax: z.number().int().positive().nullable(),
  spacingCm: z.number().int().positive().nullable(),
  growthHabit: z
    .string()
    .nullable()
    .describe(
      "Free text describing how this cultivar grows where that's meaningfully distinct — e.g. \"bush (determinate)\" or \"cordon (indeterminate)\" for a tomato, \"climbing\" or \"dwarf\" for a bean. Null if not a genuinely distinguishing trait for this crop type.",
    ),
  diseaseResistanceNotes: z.string().nullable(),
  characteristics: z
    .string()
    .nullable()
    .describe("A short one-sentence blurb on what makes this cultivar distinct — flavour, colour, notable traits."),
  estimatedRetailPricePerKgGbp: z
    .number()
    .positive()
    .nullable()
    .describe("Only set if this cultivar's typical retail price genuinely differs from the parent crop's (e.g. a heirloom/specialty premium)."),
});
export type VarietyFactsOutput = z.infer<typeof VarietyFactsOutputSchema>;

export type VarietyFactsResult = {
  output: VarietyFactsOutput;
  provider: string;
  model: string;
};

export type ParentCropFacts = {
  name: string;
  category: string;
  spacingCm: number;
  daysToHarvestMin: number;
  daysToHarvestMax: number;
  estimatedRetailPricePerKgGbp: number;
};

function buildPrompt(cropName: string, varietyName: string, parent: ParentCropFacts): string {
  return `You are an expert UK fruit-and-vegetable gardening advisor. A gardener wants to grow the "${varietyName}" variety/cultivar of ${cropName}, which isn't in our reference catalog yet.

PARENT CROP BASELINE (${parent.name}, ${parent.category})
- Typical spacing: ${parent.spacingCm}cm
- Typical days to harvest: ${parent.daysToHarvestMin}-${parent.daysToHarvestMax}
- Typical UK retail price: £${parent.estimatedRetailPricePerKgGbp.toFixed(2)}/kg

Respond with:
- name: the cultivar's correct name, properly capitalized and spelled (e.g. "Moneymaker") — correct any typo or casing in "${varietyName}" rather than repeating it verbatim; this is what gets saved to a shared catalog other gardeners will see
- daysToHarvestMin/daysToHarvestMax: ONLY if this cultivar's days-to-harvest genuinely differs from the parent baseline above — otherwise null
- spacingCm: ONLY if this cultivar needs meaningfully different spacing than the parent baseline (e.g. a compact/dwarf/patio cultivar) — otherwise null
- growthHabit: how this cultivar grows, if that's a meaningfully distinguishing trait for this crop type (e.g. bush vs cordon for a tomato) — otherwise null
- diseaseResistanceNotes: brief notes if this cultivar has notable disease resistance — otherwise null
- characteristics: a short one-sentence blurb on what makes it distinct (flavour, colour, notable traits) — otherwise null
- estimatedRetailPricePerKgGbp: ONLY if this cultivar's typical retail price genuinely differs from the parent baseline (e.g. a heirloom/specialty premium) — otherwise null

Leave every override field null unless this specific cultivar genuinely differs from the parent crop baseline — don't invent distinctions that don't exist just to fill every field.`;
}

/**
 * Looks up cultivar-specific facts for a variety not yet in the
 * `crop_varieties` catalog — mirrors cropFacts.ts's exact shape (own schema,
 * own prompt, own mock), reusing the same "crop_facts" tenant-config agent
 * slot rather than adding a new configurable agent: this is the same kind of
 * cheap, structured research lookup, just one level more specific. Callers
 * are responsible for persisting the result (this agent has no DB access).
 */
export async function getVarietyFacts(
  tenantId: string,
  cropName: string,
  varietyName: string,
  parent: ParentCropFacts,
): Promise<VarietyFactsResult> {
  const resolved = await getModelForTenant(tenantId, "crop_facts");

  if (resolved) {
    const { object } = await generateObject({
      model: resolved.model,
      schema: VarietyFactsOutputSchema,
      prompt: buildPrompt(cropName, varietyName, parent),
    });
    return { output: object, provider: resolved.provider, model: resolved.modelId };
  }

  return { output: buildMockVarietyFacts(varietyName), provider: "mock", model: "mock-variety-facts-v1" };
}

/**
 * No AI key configured — same dev-mode fallback pattern as cropFacts.ts's
 * own mock. Can't actually judge whether a cultivar differs from its parent
 * without a real model, so every override stays null (the always-safe
 * answer) except the title-cased name.
 */
function buildMockVarietyFacts(varietyName: string): VarietyFactsOutput {
  const name = varietyName
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    name,
    daysToHarvestMin: null,
    daysToHarvestMax: null,
    spacingCm: null,
    growthHabit: null,
    diseaseResistanceNotes: null,
    characteristics: `[Mock variety facts for "${varietyName}" — connect a Gemini API key for real data.]`,
    estimatedRetailPricePerKgGbp: null,
  };
}
