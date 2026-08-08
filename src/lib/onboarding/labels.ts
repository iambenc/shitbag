import type { PlotSize, ExpertiseLevel } from "@/db/schema";

export const plotSizeLabels: Record<PlotSize, string> = {
  window_ledge: "Window ledge",
  balcony: "Balcony",
  small_garden: "Small garden",
  medium_garden: "Medium garden",
  large_garden: "Large garden",
  allotment: "Allotment",
};

export const expertiseLevelLabels: Record<ExpertiseLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};
