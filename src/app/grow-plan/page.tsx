import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { growPlans, planRecommendations, crops } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { generateGrowPlanAction } from "@/lib/actions/growPlan";
import { GrowPlanInterstitial } from "@/components/GrowPlanInterstitial";

export default async function GrowPlanPage() {
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
        <h1 className="text-2xl font-semibold text-(--brand-primary)">AI Grow Plan</h1>
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6">
          <p className="font-medium">This is a membership feature.</p>
          <p className="mt-2 text-sm text-[#1f2a1f]/70">
            Subscribers get an AI-generated plan tailored to their plot, seeds, and experience —
            with reasoning, a shopping list for anything missing, and tasks added straight to the
            calendar.
          </p>
          <Link
            href="/upgrade"
            className="mt-4 inline-block rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white hover:opacity-90"
          >
            View membership
          </Link>
        </div>
      </div>
    );
  }

  const latestPlan = await withTenant(tenant.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(growPlans)
      .where(eq(growPlans.userId, session.user.id))
      .orderBy(desc(growPlans.createdAt))
      .limit(1);
    return row;
  });

  const recommendations = latestPlan?.status === "complete"
    ? await withTenant(tenant.id, async (tx) =>
        tx
          .select({ recommendation: planRecommendations, crop: crops })
          .from(planRecommendations)
          .innerJoin(crops, eq(planRecommendations.cropId, crops.id))
          .where(eq(planRecommendations.growPlanId, latestPlan.id)),
      )
    : [];

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">AI Grow Plan</h1>

      {!latestPlan && (
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6">
          <p className="text-sm text-[#1f2a1f]/70">
            Generate a plan based on your plot, seeds, favourite crops, and experience level.
          </p>
          <form action={generateGrowPlanAction} className="mt-4">
            <button
              type="submit"
              className="rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white hover:opacity-90"
            >
              Generate my grow plan
            </button>
          </form>
        </div>
      )}

      {latestPlan?.status === "pending" && (
        <div className="mt-8">
          <GrowPlanInterstitial growPlanId={latestPlan.id} />
        </div>
      )}

      {latestPlan?.status === "failed" && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="font-medium text-red-800">Something went wrong generating your plan.</p>
          {latestPlan.errorMessage && (
            <p className="mt-1 text-sm text-red-700">{latestPlan.errorMessage}</p>
          )}
          <form action={generateGrowPlanAction} className="mt-4">
            <button
              type="submit"
              className="rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white hover:opacity-90"
            >
              Try again
            </button>
          </form>
        </div>
      )}

      {latestPlan?.status === "complete" && (
        <div className="mt-8 flex flex-col gap-6">
          <div className="rounded-lg border border-black/10 bg-white p-6">
            <p className="text-sm text-[#1f2a1f]/80">
              {(latestPlan.rawOutput as { summary?: string } | null)?.summary}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {recommendations.map(({ recommendation, crop }) => (
              <div key={recommendation.id} className="rounded-lg border border-black/10 bg-white p-6">
                <p className="font-medium">
                  {crop.emoji} {crop.name}
                  {recommendation.requiresPurchase && (
                    <span className="ml-2 rounded-full bg-(--brand-secondary)/40 px-2 py-0.5 text-xs">
                      Add to shopping list
                    </span>
                  )}
                </p>
                <p className="mt-2 text-sm text-[#1f2a1f]/70">{recommendation.reasoning}</p>
                {recommendation.estimatedHarvestStart && recommendation.estimatedHarvestEnd && (
                  <p className="mt-2 text-xs text-[#1f2a1f]/50">
                    Estimated harvest: {recommendation.estimatedHarvestStart} – {recommendation.estimatedHarvestEnd}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <Link href="/calendar" className="text-sm text-(--brand-primary) underline">
              View tasks on calendar →
            </Link>
            <form action={generateGrowPlanAction}>
              <button type="submit" className="text-sm text-[#1f2a1f]/60 underline">
                Generate a new plan
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
