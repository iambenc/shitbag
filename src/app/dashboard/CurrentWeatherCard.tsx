import { weatherCodeIcon, weatherCodeLabel } from "@/lib/weather/labels";
import type { CurrentWeather } from "@/lib/weather";

// Location text is the user's stored postcode verbatim — no reverse-
// geocoding/place-name lookup exists or is added for this (see docs/plan.md).
export function CurrentWeatherCard({
  current,
  postcode,
}: {
  current: CurrentWeather | null;
  postcode: string | null;
}) {
  if (!current) {
    return (
      <div className="flex h-full flex-col justify-center rounded-lg border border-black/10 bg-white p-5 shadow-card">
        <p className="text-sm text-(--text-muted)">
          {postcode ? "Weather is unavailable right now." : "Add your postcode to see today's weather."}
        </p>
      </div>
    );
  }

  // Called directly as a function, not rendered via a dynamically-bound JSX
  // tag (`<Icon />`) — the lookup-then-render-as-JSX shape trips the
  // react-hooks static-components rule when it sits directly in a
  // component's own render body (unlike the same lookup inside a .map()
  // callback elsewhere in this codebase, which the rule doesn't flag).
  const weatherIconEl = weatherCodeIcon(current.weatherCode)({ className: "h-12 w-12 shrink-0 text-(--brand-primary)" });
  return (
    <div className="flex h-full items-center gap-4 rounded-lg border border-black/10 bg-white p-5 shadow-card">
      <span role="img" aria-label={weatherCodeLabel(current.weatherCode)}>
        {weatherIconEl}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="font-display text-3xl font-semibold">{Math.round(current.temperatureC)}°C</p>
          <p className="text-sm text-(--text-muted)">{weatherCodeLabel(current.weatherCode)}</p>
        </div>
        <p className="text-xs text-(--text-muted)">
          Feels like {Math.round(current.apparentTemperatureC)}°{postcode ? ` · ${postcode}` : ""}
        </p>
        <p className="text-xs text-(--text-muted)">
          Humidity {Math.round(current.relativeHumidityPct)}% · Wind {Math.round(current.windSpeedKmh)} km/h
        </p>
      </div>
    </div>
  );
}
