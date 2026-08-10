import {
  WeatherSunIcon,
  WeatherPartlyCloudyIcon,
  WeatherCloudIcon,
  WeatherFogIcon,
  WeatherDrizzleIcon,
  WeatherRainIcon,
  WeatherSnowIcon,
  WeatherThunderstormIcon,
} from "@/components/icons";

// Open-Meteo's `weathercode` field is the WMO weather interpretation code —
// a fixed, small enumeration, so this is a direct lookup rather than a
// range/bucket helper. https://open-meteo.com/en/docs (WMO Weather codes).
// icon groups several close codes onto one glyph (e.g. all snow variants
// share one icon) — the label stays precise per-code regardless.
const WEATHER_CODE_INFO: Record<number, { emoji: string; label: string; icon: typeof WeatherSunIcon }> = {
  0: { emoji: "☀️", label: "Clear sky", icon: WeatherSunIcon },
  1: { emoji: "🌤️", label: "Mainly clear", icon: WeatherSunIcon },
  2: { emoji: "⛅", label: "Partly cloudy", icon: WeatherPartlyCloudyIcon },
  3: { emoji: "☁️", label: "Overcast", icon: WeatherCloudIcon },
  45: { emoji: "🌫️", label: "Fog", icon: WeatherFogIcon },
  48: { emoji: "🌫️", label: "Rime fog", icon: WeatherFogIcon },
  51: { emoji: "🌦️", label: "Light drizzle", icon: WeatherDrizzleIcon },
  53: { emoji: "🌦️", label: "Drizzle", icon: WeatherDrizzleIcon },
  55: { emoji: "🌦️", label: "Dense drizzle", icon: WeatherDrizzleIcon },
  56: { emoji: "🌧️", label: "Freezing drizzle", icon: WeatherRainIcon },
  57: { emoji: "🌧️", label: "Freezing drizzle", icon: WeatherRainIcon },
  61: { emoji: "🌧️", label: "Light rain", icon: WeatherRainIcon },
  63: { emoji: "🌧️", label: "Rain", icon: WeatherRainIcon },
  65: { emoji: "🌧️", label: "Heavy rain", icon: WeatherRainIcon },
  66: { emoji: "🌧️", label: "Freezing rain", icon: WeatherRainIcon },
  67: { emoji: "🌧️", label: "Heavy freezing rain", icon: WeatherRainIcon },
  71: { emoji: "❄️", label: "Light snow", icon: WeatherSnowIcon },
  73: { emoji: "❄️", label: "Snow", icon: WeatherSnowIcon },
  75: { emoji: "❄️", label: "Heavy snow", icon: WeatherSnowIcon },
  77: { emoji: "❄️", label: "Snow grains", icon: WeatherSnowIcon },
  80: { emoji: "🌦️", label: "Rain showers", icon: WeatherDrizzleIcon },
  81: { emoji: "🌦️", label: "Rain showers", icon: WeatherDrizzleIcon },
  82: { emoji: "🌧️", label: "Violent rain showers", icon: WeatherRainIcon },
  85: { emoji: "🌨️", label: "Snow showers", icon: WeatherSnowIcon },
  86: { emoji: "🌨️", label: "Heavy snow showers", icon: WeatherSnowIcon },
  95: { emoji: "⛈️", label: "Thunderstorm", icon: WeatherThunderstormIcon },
  96: { emoji: "⛈️", label: "Thunderstorm with hail", icon: WeatherThunderstormIcon },
  99: { emoji: "⛈️", label: "Thunderstorm with hail", icon: WeatherThunderstormIcon },
};

const DEFAULT_INFO = { emoji: "☁️", label: "Unknown", icon: WeatherCloudIcon };

export function weatherCodeEmoji(code: number): string {
  return (WEATHER_CODE_INFO[code] ?? DEFAULT_INFO).emoji;
}

export function weatherCodeLabel(code: number): string {
  return (WEATHER_CODE_INFO[code] ?? DEFAULT_INFO).label;
}

export function weatherCodeIcon(code: number): typeof WeatherSunIcon {
  return (WEATHER_CODE_INFO[code] ?? DEFAULT_INFO).icon;
}
