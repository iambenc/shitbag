import type { CropCategory } from "@/db/schema";

/**
 * Popular UK fruit/veg/herb catalog for the onboarding swipe deck and the
 * (future) grow-planner agent. Spacing/depth/sowing-window/days-to-harvest
 * figures are reasonable general-knowledge approximations for a UK garden,
 * not sourced from an authoritative horticultural dataset — replacing this
 * with RHS-sourced data is an open item in docs/plan.md.
 *
 * Months are 1–12; null means "not typically applicable" (e.g. most root
 * veg aren't started indoors).
 */
export type CropSeed = {
  slug: string;
  name: string;
  category: CropCategory;
  emoji: string;
  spacingCm: number;
  soilDepthCm: number;
  sowIndoorFromMonth: number | null;
  sowIndoorToMonth: number | null;
  sowOutdoorFromMonth: number | null;
  sowOutdoorToMonth: number | null;
  daysToHarvestMin: number;
  daysToHarvestMax: number;
  supportsSuccessionSowing: boolean;
  feedingNotes: string;
};

export const cropSeeds: CropSeed[] = [
  { slug: "tomato", name: "Tomato", category: "vegetable", emoji: "🍅", spacingCm: 45, soilDepthCm: 30, sowIndoorFromMonth: 2, sowIndoorToMonth: 4, sowOutdoorFromMonth: 5, sowOutdoorToMonth: 6, daysToHarvestMin: 60, daysToHarvestMax: 80, supportsSuccessionSowing: false, feedingNotes: "Weekly high-potash tomato feed once the first fruits set." },
  { slug: "potato", name: "Potato", category: "vegetable", emoji: "🥔", spacingCm: 30, soilDepthCm: 15, sowIndoorFromMonth: null, sowIndoorToMonth: null, sowOutdoorFromMonth: 3, sowOutdoorToMonth: 4, daysToHarvestMin: 70, daysToHarvestMax: 120, supportsSuccessionSowing: false, feedingNotes: "Earth up regularly; general fertiliser at planting is usually enough." },
  { slug: "carrot", name: "Carrot", category: "vegetable", emoji: "🥕", spacingCm: 5, soilDepthCm: 2, sowIndoorFromMonth: null, sowIndoorToMonth: null, sowOutdoorFromMonth: 3, sowOutdoorToMonth: 7, daysToHarvestMin: 60, daysToHarvestMax: 80, supportsSuccessionSowing: true, feedingNotes: "Low feed needs — avoid fresh manure, which causes forked roots." },
  { slug: "onion", name: "Onion", category: "vegetable", emoji: "🧅", spacingCm: 10, soilDepthCm: 2, sowIndoorFromMonth: null, sowIndoorToMonth: null, sowOutdoorFromMonth: 3, sowOutdoorToMonth: 4, daysToHarvestMin: 90, daysToHarvestMax: 120, supportsSuccessionSowing: false, feedingNotes: "Occasional general feed until bulbs start swelling, then stop." },
  { slug: "courgette", name: "Courgette", category: "vegetable", emoji: "🥒", spacingCm: 90, soilDepthCm: 30, sowIndoorFromMonth: 4, sowIndoorToMonth: 5, sowOutdoorFromMonth: 5, sowOutdoorToMonth: 6, daysToHarvestMin: 45, daysToHarvestMax: 60, supportsSuccessionSowing: false, feedingNotes: "Weekly high-potash feed once fruiting starts." },
  { slug: "runner-bean", name: "Runner Bean", category: "vegetable", emoji: "🫘", spacingCm: 20, soilDepthCm: 5, sowIndoorFromMonth: 4, sowIndoorToMonth: 5, sowOutdoorFromMonth: 5, sowOutdoorToMonth: 6, daysToHarvestMin: 60, daysToHarvestMax: 90, supportsSuccessionSowing: false, feedingNotes: "Liquid feed weekly once flowering to keep pods coming." },
  { slug: "french-bean", name: "French Bean", category: "vegetable", emoji: "🫛", spacingCm: 15, soilDepthCm: 5, sowIndoorFromMonth: 4, sowIndoorToMonth: 5, sowOutdoorFromMonth: 5, sowOutdoorToMonth: 6, daysToHarvestMin: 50, daysToHarvestMax: 70, supportsSuccessionSowing: true, feedingNotes: "Light feed once flowering; avoid excess nitrogen." },
  { slug: "pea", name: "Pea", category: "vegetable", emoji: "🌱", spacingCm: 5, soilDepthCm: 4, sowIndoorFromMonth: 2, sowIndoorToMonth: 3, sowOutdoorFromMonth: 3, sowOutdoorToMonth: 6, daysToHarvestMin: 60, daysToHarvestMax: 70, supportsSuccessionSowing: true, feedingNotes: "Minimal feeding needed — peas fix their own nitrogen." },
  { slug: "lettuce", name: "Lettuce", category: "vegetable", emoji: "🥬", spacingCm: 25, soilDepthCm: 1, sowIndoorFromMonth: 2, sowIndoorToMonth: 3, sowOutdoorFromMonth: 3, sowOutdoorToMonth: 8, daysToHarvestMin: 40, daysToHarvestMax: 60, supportsSuccessionSowing: true, feedingNotes: "Little needed beyond consistent watering." },
  { slug: "spinach", name: "Spinach", category: "vegetable", emoji: "🍃", spacingCm: 15, soilDepthCm: 2, sowIndoorFromMonth: null, sowIndoorToMonth: null, sowOutdoorFromMonth: 3, sowOutdoorToMonth: 9, daysToHarvestMin: 40, daysToHarvestMax: 50, supportsSuccessionSowing: true, feedingNotes: "Occasional general feed; bolts quickly in hot, dry spells." },
  { slug: "kale", name: "Kale", category: "vegetable", emoji: "🥬", spacingCm: 45, soilDepthCm: 1, sowIndoorFromMonth: 4, sowIndoorToMonth: 5, sowOutdoorFromMonth: 4, sowOutdoorToMonth: 7, daysToHarvestMin: 55, daysToHarvestMax: 75, supportsSuccessionSowing: false, feedingNotes: "Monthly general feed once established." },
  { slug: "cabbage", name: "Cabbage", category: "vegetable", emoji: "🥬", spacingCm: 45, soilDepthCm: 1, sowIndoorFromMonth: 3, sowIndoorToMonth: 5, sowOutdoorFromMonth: 4, sowOutdoorToMonth: 6, daysToHarvestMin: 90, daysToHarvestMax: 120, supportsSuccessionSowing: false, feedingNotes: "Regular general feed through the growing season." },
  { slug: "broccoli", name: "Broccoli", category: "vegetable", emoji: "🥦", spacingCm: 45, soilDepthCm: 1, sowIndoorFromMonth: 3, sowIndoorToMonth: 5, sowOutdoorFromMonth: 4, sowOutdoorToMonth: 6, daysToHarvestMin: 60, daysToHarvestMax: 90, supportsSuccessionSowing: false, feedingNotes: "Monthly general feed; keep well watered while heads form." },
  { slug: "beetroot", name: "Beetroot", category: "vegetable", emoji: "🟣", spacingCm: 10, soilDepthCm: 2, sowIndoorFromMonth: null, sowIndoorToMonth: null, sowOutdoorFromMonth: 3, sowOutdoorToMonth: 7, daysToHarvestMin: 60, daysToHarvestMax: 70, supportsSuccessionSowing: true, feedingNotes: "Minimal feed needed." },
  { slug: "radish", name: "Radish", category: "vegetable", emoji: "🔴", spacingCm: 3, soilDepthCm: 1, sowIndoorFromMonth: null, sowIndoorToMonth: null, sowOutdoorFromMonth: 3, sowOutdoorToMonth: 8, daysToHarvestMin: 25, daysToHarvestMax: 35, supportsSuccessionSowing: true, feedingNotes: "None needed — fast-growing and undemanding." },
  { slug: "spring-onion", name: "Spring Onion", category: "vegetable", emoji: "🧅", spacingCm: 3, soilDepthCm: 1, sowIndoorFromMonth: null, sowIndoorToMonth: null, sowOutdoorFromMonth: 3, sowOutdoorToMonth: 8, daysToHarvestMin: 55, daysToHarvestMax: 70, supportsSuccessionSowing: true, feedingNotes: "Minimal feed needed." },
  { slug: "garlic", name: "Garlic", category: "vegetable", emoji: "🧄", spacingCm: 15, soilDepthCm: 5, sowIndoorFromMonth: null, sowIndoorToMonth: null, sowOutdoorFromMonth: 10, sowOutdoorToMonth: 11, daysToHarvestMin: 180, daysToHarvestMax: 240, supportsSuccessionSowing: false, feedingNotes: "General feed in spring as growth resumes." },
  { slug: "leek", name: "Leek", category: "vegetable", emoji: "🧅", spacingCm: 15, soilDepthCm: 5, sowIndoorFromMonth: 2, sowIndoorToMonth: 4, sowOutdoorFromMonth: 4, sowOutdoorToMonth: 6, daysToHarvestMin: 120, daysToHarvestMax: 180, supportsSuccessionSowing: false, feedingNotes: "Occasional general feed through summer." },
  { slug: "sweetcorn", name: "Sweetcorn", category: "vegetable", emoji: "🌽", spacingCm: 35, soilDepthCm: 3, sowIndoorFromMonth: 4, sowIndoorToMonth: 5, sowOutdoorFromMonth: 5, sowOutdoorToMonth: 6, daysToHarvestMin: 80, daysToHarvestMax: 100, supportsSuccessionSowing: false, feedingNotes: "General feed when young; plant in blocks, not rows, for pollination." },
  { slug: "squash", name: "Squash", category: "vegetable", emoji: "🎃", spacingCm: 90, soilDepthCm: 30, sowIndoorFromMonth: 4, sowIndoorToMonth: 5, sowOutdoorFromMonth: 5, sowOutdoorToMonth: 6, daysToHarvestMin: 90, daysToHarvestMax: 120, supportsSuccessionSowing: false, feedingNotes: "High-potash feed weekly once fruits begin to swell." },
  { slug: "strawberry", name: "Strawberry", category: "fruit", emoji: "🍓", spacingCm: 35, soilDepthCm: 15, sowIndoorFromMonth: null, sowIndoorToMonth: null, sowOutdoorFromMonth: 3, sowOutdoorToMonth: 4, daysToHarvestMin: 60, daysToHarvestMax: 90, supportsSuccessionSowing: false, feedingNotes: "High-potash feed (e.g. tomato feed) once flowering starts." },
  { slug: "raspberry", name: "Raspberry", category: "fruit", emoji: "🍇", spacingCm: 40, soilDepthCm: 30, sowIndoorFromMonth: null, sowIndoorToMonth: null, sowOutdoorFromMonth: 11, sowOutdoorToMonth: 3, daysToHarvestMin: 365, daysToHarvestMax: 425, supportsSuccessionSowing: false, feedingNotes: "General fertiliser in early spring; mulch well." },
  { slug: "chilli-pepper", name: "Chilli Pepper", category: "vegetable", emoji: "🌶️", spacingCm: 40, soilDepthCm: 25, sowIndoorFromMonth: 1, sowIndoorToMonth: 3, sowOutdoorFromMonth: 6, sowOutdoorToMonth: 6, daysToHarvestMin: 90, daysToHarvestMax: 120, supportsSuccessionSowing: false, feedingNotes: "Weekly high-potash feed once flowering." },
  { slug: "cucumber", name: "Cucumber", category: "vegetable", emoji: "🥒", spacingCm: 45, soilDepthCm: 30, sowIndoorFromMonth: 3, sowIndoorToMonth: 4, sowOutdoorFromMonth: 5, sowOutdoorToMonth: 6, daysToHarvestMin: 55, daysToHarvestMax: 70, supportsSuccessionSowing: false, feedingNotes: "Weekly high-potash feed once fruiting." },
  { slug: "basil", name: "Basil", category: "herb", emoji: "🌿", spacingCm: 20, soilDepthCm: 15, sowIndoorFromMonth: 3, sowIndoorToMonth: 5, sowOutdoorFromMonth: 6, sowOutdoorToMonth: 7, daysToHarvestMin: 30, daysToHarvestMax: 60, supportsSuccessionSowing: true, feedingNotes: "Little needed; avoid overwatering more than feeding." },
];
