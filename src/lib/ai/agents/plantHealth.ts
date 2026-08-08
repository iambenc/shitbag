import "server-only";
import { z } from "zod";
import { generateObject } from "ai";
import { getModelForTenant } from "@/lib/ai/provider";

export const PlantDiagnosisOutputSchema = z.object({
  issue: z.string(),
  severity: z.enum(["none", "low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  likelyCauses: z.array(z.string()),
  careInstructions: z.array(z.string()),
  explanation: z.string(),
});
export type PlantDiagnosisOutput = z.infer<typeof PlantDiagnosisOutputSchema>;

export type PlantHealthInput = {
  imageBuffer: Buffer;
  contentType: string;
  expertiseLevel: string | null;
};

export type PlantHealthResult = {
  output: PlantDiagnosisOutput;
  provider: string;
  model: string;
};

const MOCK_DIAGNOSES: PlantDiagnosisOutput[] = [
  {
    issue: "Powdery mildew",
    severity: "medium",
    confidence: 0.7,
    likelyCauses: ["High humidity with poor air circulation", "Leaves staying damp overnight"],
    careInstructions: [
      "Remove and dispose of the worst-affected leaves.",
      "Improve air flow by spacing plants further apart.",
      "Water at the base rather than over the leaves.",
    ],
    explanation:
      "[Mock diagnosis — connect a Gemini API key for a real assessment.] The pale, dusty coating described is a classic sign of powdery mildew, common in humid conditions.",
  },
  {
    issue: "Nutrient deficiency (likely nitrogen)",
    severity: "low",
    confidence: 0.6,
    likelyCauses: ["Poor soil fertility", "Heavy rain leaching nutrients from the soil"],
    careInstructions: [
      "Apply a balanced general-purpose feed.",
      "Mulch around the base to help retain nutrients.",
    ],
    explanation:
      "[Mock diagnosis — connect a Gemini API key for a real assessment.] Pale or yellowing older leaves often point to a nutrient shortfall rather than disease.",
  },
  {
    issue: "No obvious issues detected",
    severity: "none",
    confidence: 0.5,
    likelyCauses: [],
    careInstructions: ["Keep up your current watering and feeding routine.", "Recheck in a week or two."],
    explanation:
      "[Mock diagnosis — connect a Gemini API key for a real assessment.] Nothing concerning stands out; this is a placeholder result since no AI key is configured.",
  },
];

export async function diagnosePlant(
  tenantId: string,
  input: PlantHealthInput,
): Promise<PlantHealthResult> {
  const resolved = await getModelForTenant(tenantId, "plant_health");

  if (resolved) {
    const { object } = await generateObject({
      model: resolved.model,
      schema: PlantDiagnosisOutputSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert in plant health for home fruit-and-vegetable gardeners. Look at this photo and diagnose any issues (pests, disease, nutrient deficiency, watering problems, etc.) — or say so if the plant looks healthy. Explain your reasoning in language appropriate for a gardener with ${
                input.expertiseLevel ?? "beginner"
              } experience, and give clear, actionable care instructions.`,
            },
            { type: "file", mediaType: input.contentType, data: input.imageBuffer },
          ],
        },
      ],
    });
    return { output: object, provider: resolved.provider, model: resolved.modelId };
  }

  // No AI key configured anywhere — deterministic mock, varied by image size so
  // repeated test runs aren't all identical, not pretending to analyse the photo.
  const index = input.imageBuffer.length % MOCK_DIAGNOSES.length;
  return { output: MOCK_DIAGNOSES[index], provider: "mock", model: "mock-plant-health-v1" };
}
