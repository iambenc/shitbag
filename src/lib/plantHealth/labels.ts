import type { PlantDiagnosisSeverity } from "@/db/schema";

export const severityLabels: Record<PlantDiagnosisSeverity, string> = {
  none: "No issue",
  low: "Low severity",
  medium: "Medium severity",
  high: "High severity",
};

// Differentiated by severity so a gardener can tell urgency at a glance,
// not just read it — terracotta only ever pairs with white text (fails
// WCAG AA with dark text), the reverse of the brand-primary tint below.
export const severityBadgeClasses: Record<PlantDiagnosisSeverity, string> = {
  none: "bg-(--brand-primary)/15 text-[#1f2a1f]",
  low: "bg-(--brand-primary)/15 text-[#1f2a1f]",
  medium: "bg-(--color-terracotta) text-white",
  high: "bg-red-200 text-red-800",
};
