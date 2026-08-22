import { weatherCodeLabel, weatherCodeIcon } from "@/lib/weather/labels";
import type { DailyForecast } from "@/lib/weather";

// Lift-and-reskin of the block that used to live inline in dashboard/page.tsx
// — logic unchanged, just its own file/card now.
export function WeeklyForecastStrip({
  weeklyForecast,
  hasPostcode,
}: {
  weeklyForecast: DailyForecast[] | null;
  hasPostcode: boolean;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-5 shadow-card">
      <p className="font-display text-lg font-semibold">7-day weather forecast</p>
      <div className="mt-3">
        {!weeklyForecast ? (
          <p className="text-sm text-(--text-muted)">
            {hasPostcode ? "Weather is unavailable right now." : "Add your postcode to see a forecast."}
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
            {weeklyForecast.map((day, i) => {
              const WeatherIcon = weatherCodeIcon(day.weatherCode);
              return (
                <div key={day.date} className="flex flex-col items-center gap-1 text-center text-xs">
                  <p className="text-(--text-muted)">
                    {i === 0 ? "Today" : new Date(day.date).toLocaleDateString("en-GB", { weekday: "short" })}
                  </p>
                  <span role="img" aria-label={weatherCodeLabel(day.weatherCode)} title={weatherCodeLabel(day.weatherCode)}>
                    <WeatherIcon className="h-8 w-8 text-(--brand-primary)" />
                  </span>
                  <p className="font-medium">{Math.round(day.maxTempC)}°</p>
                  <p className="text-(--text-muted)">{Math.round(day.minTempC)}°</p>
                  {day.precipitationMm >= 1 && <p className="text-(--text-muted)">💧{Math.round(day.precipitationMm)}mm</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
