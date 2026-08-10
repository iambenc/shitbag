import "server-only";
import { addDaysIso } from "@/lib/dates";

export type Forecast = { maxTempC: number; precipitationMm: number };
export type WeatherScenario = "hot_dry" | "rainy" | "mild";

export type DailyForecast = {
  date: string;
  maxTempC: number;
  minTempC: number;
  precipitationMm: number;
  weatherCode: number;
};

const FORCED_SCENARIOS: Record<WeatherScenario, Forecast> = {
  hot_dry: { maxTempC: 28, precipitationMm: 0 },
  rainy: { maxTempC: 15, precipitationMm: 8 },
  mild: { maxTempC: 18, precipitationMm: 2 },
};

// Representative WMO weather codes for each forced scenario, so the dev
// override produces a plausible icon too, not just plausible numbers.
const FORCED_SCENARIO_CODES: Record<WeatherScenario, number> = {
  hot_dry: 0,
  rainy: 61,
  mild: 2,
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

/**
 * A 7-day-ahead forecast for the dashboard's weekly display — a separate
 * function from getForecast() rather than a shared/parameterized one, since
 * that one backs the daily job's watering-task rules pass and this is purely
 * informational display; not worth risking that proven code path for reuse.
 * Same forced-scenario override as getForecast(), repeated across all 7
 * days, so local dev/testing can preview the widget without live network
 * calls.
 */
export async function getWeeklyForecast(
  lat: number,
  lon: number,
  forceScenario?: WeatherScenario,
): Promise<DailyForecast[] | null> {
  const forced = forceScenario ?? (process.env.WEATHER_FORCE_SCENARIO as WeatherScenario | undefined);
  if (forced && forced in FORCED_SCENARIOS) {
    const { maxTempC, precipitationMm } = FORCED_SCENARIOS[forced];
    const weatherCode = FORCED_SCENARIO_CODES[forced];
    return Array.from({ length: 7 }, (_, i) => ({
      date: addDaysIso(i),
      maxTempC,
      minTempC: maxTempC - 6,
      precipitationMm,
      weatherCode,
    }));
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=7`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      daily?: {
        time?: string[];
        weathercode?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
      };
    };
    const { time, weathercode, temperature_2m_max, temperature_2m_min, precipitation_sum } = data.daily ?? {};
    if (!time || !weathercode || !temperature_2m_max || !temperature_2m_min || !precipitation_sum) return null;

    const days: DailyForecast[] = time.map((date, i) => ({
      date,
      maxTempC: temperature_2m_max[i],
      minTempC: temperature_2m_min[i],
      precipitationMm: precipitation_sum[i],
      weatherCode: weathercode[i],
    }));
    return days.every((d) => Number.isFinite(d.maxTempC) && Number.isFinite(d.minTempC)) ? days : null;
  } catch (err) {
    console.error("[weather] weekly fetch failed", err);
    return null;
  }
}

export function isHotAndDry(forecast: Forecast): boolean {
  return forecast.maxTempC >= 25 && forecast.precipitationMm < 1;
}

export function isRainy(forecast: Forecast): boolean {
  return forecast.precipitationMm >= 5;
}
