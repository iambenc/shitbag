import "server-only";
import { z } from "zod";
import { generateObject } from "ai";
import { getModelForTenant } from "@/lib/ai/provider";
import { isHotAndDry, isRainy, type DailyForecast } from "@/lib/weather";

export const WeatherSuggestionSchema = z.object({
  title: z.string().describe("A short, actionable task title, e.g. \"Water your plants today\"."),
  notes: z.string().describe("One or two sentences explaining why, referencing the forecast."),
});
export type WeatherSuggestion = z.infer<typeof WeatherSuggestionSchema>;

export const WeatherAdvisorOutputSchema = z.object({
  suggestions: z
    .array(WeatherSuggestionSchema)
    .max(3)
    .describe(
      "0-3 concrete, actionable gardening suggestions genuinely warranted by the forecast. Most " +
        "mild, unremarkable days should produce ZERO suggestions — don't manufacture busywork just " +
        "to have something to say.",
    ),
});
export type WeatherAdvisorOutput = z.infer<typeof WeatherAdvisorOutputSchema>;

export type WeatherAdvisorInput = {
  weeklyForecast: DailyForecast[];
  expertiseLevel: string | null;
};

export type WeatherAdvisorResult = {
  output: WeatherAdvisorOutput;
  provider: string;
  model: string;
};

// Mirrors the deterministic rule this agent replaces exactly, so mock-mode
// behaviour (no AI key configured) doesn't regress what was live before:
// hot+dry -> the same watering task that used to be hardcoded; rainy ->
// nothing (rain already does the watering); otherwise -> nothing.
function buildMockOutput(today: DailyForecast): WeatherAdvisorOutput {
  const forecast = { maxTempC: today.maxTempC, precipitationMm: today.precipitationMm };
  if (isHotAndDry(forecast)) {
    return {
      suggestions: [
        {
          title: "Water your plants today",
          notes: "[Mock advice — connect a Gemini API key for real suggestions.] Hot, dry weather is forecast — your plants will need extra water today.",
        },
      ],
    };
  }
  if (isRainy(forecast)) {
    return { suggestions: [] };
  }
  return { suggestions: [] };
}

export async function assessWeather(
  tenantId: string,
  input: WeatherAdvisorInput,
): Promise<WeatherAdvisorResult> {
  const resolved = await getModelForTenant(tenantId, "weather_advisor");
  const today = input.weeklyForecast[0];

  if (resolved) {
    const forecastText = input.weeklyForecast
      .map((d) => `- ${d.date}: max ${d.maxTempC}°C, min ${d.minTempC}°C, ${d.precipitationMm}mm rain`)
      .join("\n");

    const { object } = await generateObject({
      model: resolved.model,
      schema: WeatherAdvisorOutputSchema,
      prompt: `You are an expert gardening advisor. Here is the 7-day weather forecast for a home fruit-and-vegetable gardener, starting with today:

${forecastText}

Based on this forecast, suggest 0-3 concrete, actionable things the gardener should do TODAY as a result — for example: extra watering if it's hot and dry, protecting tender plants if frost is likely, holding off watering (and watching for waterlogging or slug damage) if heavy rain is forecast, or securing/staking tall plants if strong wind is likely. Only suggest something genuinely warranted by THIS forecast — most ordinary/mild days should get zero suggestions, not a task invented for the sake of it. Write each suggestion's explanation in language appropriate for a gardener with ${input.expertiseLevel ?? "beginner"} experience.`,
    });
    return { output: object, provider: resolved.provider, model: resolved.modelId };
  }

  return { output: buildMockOutput(today), provider: "mock", model: "mock-weather-advisor-v1" };
}
