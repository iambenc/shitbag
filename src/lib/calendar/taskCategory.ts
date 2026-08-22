import type { TaskSource } from "@/db/schema";
import { GardenIcon, DropletIcon, ScissorsIcon, CameraIcon } from "@/components/icons";
import { LeafAccent } from "@/components/LeafAccent";

export const taskCategoryEnum = ["planting", "watering", "feeding", "maintenance", "health_check", "other"] as const;
export type TaskCategory = (typeof taskCategoryEnum)[number];

// tasks has no type/category column — only source (manual/ai/weather/
// maintenance), growingAreaId (non-null only on health-check tasks),
// estimatedSeedsUsed/activatesStageId (non-null only on sow/transplant
// tasks), and freeform title text that live AI output has no contractual
// obligation to follow a prefix convention for. This is a best-effort
// heuristic, not authoritative — an unrecognized freeform title falls back
// to "other" rather than a wrong guess. Structural signals are checked
// first (reliable), title text last (fragile).
export function getTaskCategory(task: {
  title: string;
  source: TaskSource;
  growingAreaId: string | null;
  estimatedSeedsUsed: number | null;
  activatesStageId: string | null;
}): TaskCategory {
  if (task.growingAreaId) return "health_check";
  if (task.source === "maintenance") return "maintenance";
  // This app's weather-advice feature only ever generates watering
  // suggestions (see weatherAdvisor.ts) — source="weather" reliably means
  // "watering," not a generic weather-triggered task type.
  if (task.source === "weather") return "watering";
  if (task.estimatedSeedsUsed || task.activatesStageId) return "planting";

  const title = task.title.trim();
  if (/^feed/i.test(title)) return "feeding";
  if (/^water/i.test(title)) return "watering";
  if (/^(sow|plant|re-sow)/i.test(title)) return "planting";
  return "other";
}

export const TASK_CATEGORY_META: Record<
  TaskCategory,
  { label: string; badgeClass: string; accentClass: string; icon: typeof GardenIcon }
> = {
  planting: {
    label: "Planting",
    badgeClass: "bg-(--brand-primary)/15 text-(--brand-primary)",
    accentClass: "text-(--brand-primary)",
    icon: GardenIcon,
  },
  watering: {
    label: "Watering",
    badgeClass: "bg-blue-100 text-blue-800",
    accentClass: "text-blue-600",
    icon: DropletIcon,
  },
  feeding: {
    label: "Feeding",
    badgeClass: "bg-amber-100 text-amber-800",
    accentClass: "text-amber-600",
    icon: ScissorsIcon,
  },
  maintenance: {
    label: "Maintenance",
    badgeClass: "bg-emerald-100 text-emerald-800",
    accentClass: "text-emerald-600",
    icon: ScissorsIcon,
  },
  health_check: {
    label: "Health Check",
    badgeClass: "bg-purple-100 text-purple-800",
    accentClass: "text-purple-600",
    icon: CameraIcon,
  },
  other: {
    label: "Task",
    badgeClass: "bg-black/10 text-(--text-muted)",
    accentClass: "text-(--text-muted)",
    icon: LeafAccent,
  },
};

// Month-grid legend groups feeding into the same "Maintenance" bucket as
// maintenance (closest generic-upkeep icon) — a per-task card still shows
// its own precise "Feeding" badge; only the grid rollup collapses the two.
export function gridCategoryFor(category: TaskCategory): TaskCategory {
  return category === "feeding" ? "maintenance" : category;
}
