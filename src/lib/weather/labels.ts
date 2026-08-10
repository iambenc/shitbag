// Open-Meteo's `weathercode` field is the WMO weather interpretation code —
// a fixed, small enumeration, so this is a direct lookup rather than a
// range/bucket helper. https://open-meteo.com/en/docs (WMO Weather codes).
const WEATHER_CODE_INFO: Record<number, { emoji: string; label: string }> = {
  0: { emoji: "☀️", label: "Clear sky" },
  1: { emoji: "🌤️", label: "Mainly clear" },
  2: { emoji: "⛅", label: "Partly cloudy" },
  3: { emoji: "☁️", label: "Overcast" },
  45: { emoji: "🌫️", label: "Fog" },
  48: { emoji: "🌫️", label: "Rime fog" },
  51: { emoji: "🌦️", label: "Light drizzle" },
  53: { emoji: "🌦️", label: "Drizzle" },
  55: { emoji: "🌦️", label: "Dense drizzle" },
  56: { emoji: "🌧️", label: "Freezing drizzle" },
  57: { emoji: "🌧️", label: "Freezing drizzle" },
  61: { emoji: "🌧️", label: "Light rain" },
  63: { emoji: "🌧️", label: "Rain" },
  65: { emoji: "🌧️", label: "Heavy rain" },
  66: { emoji: "🌧️", label: "Freezing rain" },
  67: { emoji: "🌧️", label: "Heavy freezing rain" },
  71: { emoji: "❄️", label: "Light snow" },
  73: { emoji: "❄️", label: "Snow" },
  75: { emoji: "❄️", label: "Heavy snow" },
  77: { emoji: "❄️", label: "Snow grains" },
  80: { emoji: "🌦️", label: "Rain showers" },
  81: { emoji: "🌦️", label: "Rain showers" },
  82: { emoji: "🌧️", label: "Violent rain showers" },
  85: { emoji: "🌨️", label: "Snow showers" },
  86: { emoji: "🌨️", label: "Heavy snow showers" },
  95: { emoji: "⛈️", label: "Thunderstorm" },
  96: { emoji: "⛈️", label: "Thunderstorm with hail" },
  99: { emoji: "⛈️", label: "Thunderstorm with hail" },
};

const DEFAULT_INFO = { emoji: "☁️", label: "Unknown" };

export function weatherCodeEmoji(code: number): string {
  return (WEATHER_CODE_INFO[code] ?? DEFAULT_INFO).emoji;
}

export function weatherCodeLabel(code: number): string {
  return (WEATHER_CODE_INFO[code] ?? DEFAULT_INFO).label;
}
