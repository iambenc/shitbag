import "server-only";

export type Forecast = { maxTempC: number; precipitationMm: number };
export type WeatherScenario = "hot_dry" | "rainy" | "mild";

const FORCED_SCENARIOS: Record<WeatherScenario, Forecast> = {
  hot_dry: { maxTempC: 28, precipitationMm: 0 },
  rainy: { maxTempC: 15, precipitationMm: 8 },
  mild: { maxTempC: 18, precipitationMm: 2 },
};

/**
 * Real weather, via Open-Meteo (free, no key — matches docs/plan.md). Real
 * weather can't be controlled by a test, so a scenario override short-
 * circuits to canned data instead of calling the API — unlike the
 * Stripe/Gemini dev-mode fallbacks, this triggers on an explicit override,
 * not on the *absence* of credentials, since no credentials are needed here
 * at all. `forceScenario` is a per-call override (threaded from the dev
 * trigger route through a single job run, so tests don't need to restart
 * the server between scenarios); WEATHER_FORCE_SCENARIO is a static env-var
 * fallback for manual local testing.
 */
export async function getForecast(
  lat: number,
  lon: number,
  forceScenario?: WeatherScenario,
): Promise<Forecast | null> {
  const forced = forceScenario ?? (process.env.WEATHER_FORCE_SCENARIO as WeatherScenario | undefined);
  if (forced && forced in FORCED_SCENARIOS) {
    return FORCED_SCENARIOS[forced];
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_sum&timezone=auto&forecast_days=1`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      daily?: { temperature_2m_max?: number[]; precipitation_sum?: number[] };
    };
    const maxTempC = data.daily?.temperature_2m_max?.[0];
    const precipitationMm = data.daily?.precipitation_sum?.[0];
    if (typeof maxTempC !== "number" || typeof precipitationMm !== "number") return null;
    return { maxTempC, precipitationMm };
  } catch (err) {
    console.error("[weather] fetch failed", err);
    return null;
  }
}

export function isHotAndDry(forecast: Forecast): boolean {
  return forecast.maxTempC >= 25 && forecast.precipitationMm < 1;
}

export function isRainy(forecast: Forecast): boolean {
  return forecast.precipitationMm >= 5;
}
