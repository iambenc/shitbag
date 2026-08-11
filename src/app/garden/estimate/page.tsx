import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { growingAreaEstimations } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { LeafAccent } from "@/components/LeafAccent";
import { UploadPhotosForm } from "./UploadPhotosForm";
import { getGrowingAreaEstimationsToday } from "@/lib/actions/growingAreaEstimation";
import { MAX_DAILY_GROWING_AREA_ESTIMATIONS } from "@/lib/ai/limits";

export default async function EstimateGrowingAreasPage() {
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
        <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Estimate from photos</h1>
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6 shadow-card">
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
            This is a membership feature.
          </p>
          <p className="mt-2 text-sm text-(--text-muted)">
            Subscribers can photograph their growing space and get an AI estimate of the pots,
            beds, and planters in it — ready to review and add to their garden.
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

  const [pending] = await withTenant(tenant.id, (tx) =>
    tx
      .select({ id: growingAreaEstimations.id })
      .from(growingAreaEstimations)
      .where(and(eq(growingAreaEstimations.userId, session.user.id), eq(growingAreaEstimations.status, "pending")))
      .orderBy(desc(growingAreaEstimations.createdAt))
      .limit(1),
  );
  // uploadPhotosForEstimationAction already redirects straight to this
  // pending id's own page — this only matters if someone lands back on the
  // index while it's still processing (e.g. a second tab, or navigating
  // away and back). Redirect there rather than hosting a second copy of
  // the interstitial here: that page is the one place the "pending ->
  // interstitial -> review" flow lives, so it's also the one place that
  // correctly ends on the actual result once the job completes.
  if (pending) redirect(`/garden/estimate/${pending.id}`);

  const estimationsToday = await getGrowingAreaEstimationsToday(tenant.id, session.user.id);
  const remainingToday = Math.max(0, MAX_DAILY_GROWING_AREA_ESTIMATIONS - estimationsToday);

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Estimate from photos</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        Upload photos of your growing space and review an AI-estimated list of areas before adding
        anything to your garden.
      </p>

      {remainingToday > 0 ? (
        <div className="mt-8">
          <UploadPhotosForm />
          <p className="mt-2 text-xs text-(--text-muted)">
            {remainingToday} of {MAX_DAILY_GROWING_AREA_ESTIMATIONS} photo estimates left today
          </p>
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6 shadow-card">
          <p className="text-sm text-(--text-muted)">
            You&rsquo;ve used all {MAX_DAILY_GROWING_AREA_ESTIMATIONS} photo estimates for today —
            come back tomorrow.
          </p>
        </div>
      )}
    </div>
  );
}
