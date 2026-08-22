import Link from "next/link";
import { EquipmentIcon } from "@/components/icons";
import { LeafAccent } from "@/components/LeafAccent";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

// Mockup shows only 3 promo cards (Seed inventory / Shopping list / Plant
// health scanner) — the current dashboard exposes 7 resource links. Rather
// than dropping the other 4 (AI Grow Plan, Favourites, Harvests, Garden
// layout), they're kept as a slim text-link row underneath so nothing
// becomes harder to reach, just visually secondary to the 3 mockup'd cards.
const MORE_LINKS = [
  { href: "/grow-plan", label: "AI Grow Plan" },
  { href: "/favourites", label: "Favourite crops" },
  { href: "/harvests", label: "Harvests" },
  { href: "/garden/layout", label: "Manage garden layout" },
  ...(FEATURE_FLAGS.moneySavedReport ? [{ href: "/savings", label: "Savings report" }] : []),
];

export function ResourceCardsRow({
  seedVarietyCount,
  shoppingItemCount,
  hasDiagnosis,
}: {
  seedVarietyCount: number;
  shoppingItemCount: number;
  hasDiagnosis: boolean;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-5 shadow-card">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
