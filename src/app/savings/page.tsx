import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { harvestLog, crops } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { computeSavings } from "@/lib/savings";
import { LeafAccent } from "@/components/LeafAccent";

export default async function SavingsPage() {
  // Defence in depth alongside the dashboard's conditional resource-link —
  // 404, not a redirect, so a guessed URL gives no signal the route exists.
  if (!FEATURE_FLAGS.moneySavedReport) notFound();

  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const subscription = await getSubscription(session.user.id, tenant.id);
  const paid = isPaidTier(subscription);

  if (!paid) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Savings report</h1>
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6 shadow-card">
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
            This is a membership feature.
          </p>
          <p className="mt-2 text-sm text-(--text-muted)">
            Subscribers see an estimate of how much they&rsquo;ve saved growing their own fruit and
            veg, based on typical UK retail prices for what they&rsquo;ve logged in the harvest log.
          </p>
          <Link
            href="/upgrade"
            className="mt-4 inline-block rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
          >
            View membership
          </Link>
        </div>
      </div>
    );
  }

  const harvests = await withTenant(tenant.id, (tx) =>
    tx
      .select({ harvest: harvestLog, crop: crops })
      .from(harvestLog)
      .innerJoin(crops, eq(harvestLog.cropId, crops.id))
      .where(eq(harvestLog.userId, session.user.id)),
  );

  const summary = computeSavings(
    harvests.map((r) => ({
      quantity: r.harvest.quantity,
      unit: r.harvest.unit,
      cropSlug: r.crop.slug,
      cropName: r.crop.name,
      cropEmoji: r.crop.emoji,
      estimatedRetailPricePerKgGbp: r.crop.estimatedRetailPricePerKgGbp,
    })),
  );

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Savings report</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        Estimated value of what you&rsquo;ve grown yourself, based on typical UK retail prices.
      </p>

      <div className="mt-8 rounded-lg border border-black/10 bg-white p-6 shadow-card">
        <p className="text-sm text-(--text-muted)">You&rsquo;ve saved an estimated</p>
        <p className="font-display text-4xl font-semibold text-(--brand-primary)">
          £{summary.totalSavedGbp.toFixed(2)}
        </p>
        <p className="mt-1 text-sm text-(--text-muted)">growing your own fruit and veg.</p>
      </div>

      {summary.byCrop.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          {summary.byCrop.map((c) => (
            <div
              key={c.cropSlug}
              className="flex items-center justify-between rounded-lg border border-black/10 bg-white p-3 text-sm shadow-card"
            >
              <span>
                {c.cropEmoji} {c.cropName} · {c.kg.toFixed(2)}kg
              </span>
              <span className="font-medium">£{c.savedGbp.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {summary.byCrop.length === 0 && (
        <div className="mt-6 flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
          <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
          <p className="text-sm text-(--text-muted)">
            Log a harvest in kg or g to start building your savings report.
          </p>
        </div>
      )}

      {summary.excludedCount > 0 && (
        <p className="mt-4 text-xs text-(--text-muted)">
          {summary.excludedCount} harvest log {summary.excludedCount === 1 ? "entry isn't" : "entries aren't"}{" "}
          included because {summary.excludedCount === 1 ? "it wasn't" : "they weren't"} logged in a weight
          unit (kg or g) — log future harvests by weight to count them here.
        </p>
      )}

      <p className="mt-6 text-xs text-(--text-muted)">
        Estimates use typical UK retail prices per crop, not what you&rsquo;d actually pay at any
        specific shop — treat this as a rough guide, not an exact figure.
      </p>
    </div>
  );
}
