import Link from "next/link";
import { EquipmentIcon } from "@/components/icons";
import { LeafAccent } from "@/components/LeafAccent";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import type { GrowPlanStatus } from "@/db/schema";

// Mockup shows only 3 promo cards (Seed inventory / Shopping list / Plant
// health scanner) — the current dashboard exposes several more resource
// links. Rather than dropping the rest (Favourites, Harvests, Garden
// layout), they're kept as a slim text-link row underneath so nothing
// becomes harder to reach, just visually secondary to the 4 promo cards.
// AI Grow Plan used to live here too but was promoted to its own card below
// — it's the one AI-generated, ongoing-status feature among these, so it
// warrants the same prominence as the other 3.
const MORE_LINKS = [
  { href: "/favourites", label: "Favourite crops" },
  { href: "/harvests", label: "Harvests" },
  // Points at the spatial drag-canvas only while it's enabled — otherwise
  // that route 404s (see src/lib/featureFlags.ts), so this falls back to
  // /garden itself, same destination My Garden's own cards now use.
  FEATURE_FLAGS.layoutPlanning
    ? { href: "/garden/layout", label: "Manage garden layout" }
    : { href: "/garden", label: "Manage your garden" },
  ...(FEATURE_FLAGS.moneySavedReport ? [{ href: "/savings", label: "Savings report" }] : []),
];

function growPlanSubtitle({
  paid,
  growPlanStatus,
  growPlanRecommendationCount,
}: {
  paid: boolean;
  growPlanStatus: GrowPlanStatus | null;
  growPlanRecommendationCount: number;
}): string {
  if (!paid) return "Unlock AI-generated plans for your plot";
  if (growPlanStatus === "pending") return "Your plan is being generated…";
  if (growPlanStatus === "failed") return "Plan generation failed — try again";
  if (growPlanStatus === "complete") {
    return growPlanRecommendationCount > 0
      ? `${growPlanRecommendationCount} recommendation${growPlanRecommendationCount === 1 ? "" : "s"} ready`
      : "View your plan";
  }
  return "Generate a plan tailored to your plot";
}

export function ResourceCardsRow({
  seedVarietyCount,
  shoppingItemCount,
  hasDiagnosis,
  paid,
  growPlanStatus,
  growPlanRecommendationCount,
}: {
  seedVarietyCount: number;
  shoppingItemCount: number;
  hasDiagnosis: boolean;
  paid: boolean;
  growPlanStatus: GrowPlanStatus | null;
  growPlanRecommendationCount: number;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-5 shadow-card">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/my-shed"
          className="flex flex-col gap-1 rounded-md border border-black/10 p-4 transition-all hover:-translate-y-0.5 hover:border-(--brand-primary)/40 hover:shadow-lg"
        >
          <LeafAccent className="h-6 w-6 text-(--brand-primary)" />
          <p className="font-display font-semibold">Seed inventory</p>
          <p className="text-xs text-(--text-muted)">
            {seedVarietyCount} variet{seedVarietyCount === 1 ? "y" : "ies"}
          </p>
        </Link>
        <Link
          href="/shopping-list"
          className="flex flex-col gap-1 rounded-md border border-black/10 p-4 transition-all hover:-translate-y-0.5 hover:border-(--brand-primary)/40 hover:shadow-lg"
        >
          <EquipmentIcon className="h-6 w-6 text-(--brand-primary)" />
          <p className="font-display font-semibold">Shopping list</p>
          <p className="text-xs text-(--text-muted)">
            {shoppingItemCount} item{shoppingItemCount === 1 ? "" : "s"}
          </p>
        </Link>
        <Link
          href="/plant-health"
          className="flex flex-col gap-1 rounded-md border border-black/10 p-4 transition-all hover:-translate-y-0.5 hover:border-(--brand-primary)/40 hover:shadow-lg"
        >
          <span aria-hidden className="text-2xl">
            📷
          </span>
          <p className="font-display font-semibold">Plant health scanner</p>
          <p className="text-xs text-(--text-muted)">
            {hasDiagnosis ? "View your latest diagnosis" : "Diagnose issues and get treatment advice."}
          </p>
        </Link>
        <Link
          href="/grow-plan"
          className="flex flex-col gap-1 rounded-md border border-black/10 p-4 transition-all hover:-translate-y-0.5 hover:border-(--brand-primary)/40 hover:shadow-lg"
        >
          <span aria-hidden className="text-2xl">
            ✨
          </span>
          <p className="font-display font-semibold">AI Grow Plan</p>
          <p className="text-xs text-(--text-muted)">
            {growPlanSubtitle({ paid, growPlanStatus, growPlanRecommendationCount })}
          </p>
        </Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-black/5 pt-3 text-sm">
        {MORE_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-(--brand-primary) underline">
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
