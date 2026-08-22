import { LeafAccent } from "@/components/LeafAccent";

// Kept short and generic — general UK gardening advice, not tied to any
// specific crop/task/weather state (unlike the rest of the dashboard, which
// is all per-user data). Picked deterministically by day-of-year so it's
// stable for the whole day rather than re-randomizing on every request.
const TIPS = [
  "Water early in the morning to reduce evaporation and keep plants healthy.",
  "Rotate where you grow crops each year to help avoid a build-up of pests and disease.",
  "Deadhead flowering plants regularly to encourage more blooms.",
  "Mulch beds after rain to lock moisture into the soil for longer.",
  "Harvest leafy crops in the morning, once any dew has dried, for the best flavour.",
  "Feed hungry crops like tomatoes and courgettes every couple of weeks once they start fruiting.",
  "Check greenhouse and cold frame vents on warm days to stop plants overheating.",
  "Sow little and often for crops like lettuce and radish to keep a steady supply.",
];

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86_400_000);
}

export function SiteFooter() {
  const tip = TIPS[dayOfYear(new Date()) % TIPS.length];
  return (
    <footer className="border-t border-(--brand-primary)/15 bg-(--surface-tint) px-6 py-3">
      <p className="mx-auto flex max-w-6xl items-center gap-2 truncate text-sm text-(--text-muted)">
        <LeafAccent className="h-4 w-4 shrink-0 text-(--brand-primary)" />
        <span className="truncate">
          <span className="font-medium text-(--text-heading)">Tip of the day:</span> {tip}
        </span>
      </p>
    </footer>
  );
}
