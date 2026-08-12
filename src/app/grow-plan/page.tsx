import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, desc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { growPlans, planRecommendations, planRecommendationStages, crops, cropVarieties, growingAreas } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { getGrowPlanGenerationsToday } from "@/lib/actions/growPlan";
import { MAX_DAILY_GROW_PLAN_GENERATIONS, MAX_RECOMMENDATION_REGENERATIONS } from "@/lib/ai/limits";
import { JobInterstitial } from "@/components/JobInterstitial";
import { LeafAccent } from "@/components/LeafAccent";
import { FadeIn } from "@/components/FadeIn";
import { growingAreaTypeLabels, growingAreaTypeEmoji, formatSizeValue } from "@/lib/garden/labels";
import { RecommendationActionButtons } from "./RecommendationActionButtons";
import { RegeneratingCard } from "./RegeneratingCard";
import { GeneratePlanButton } from "./GeneratePlanButton";
import type { GrowingAreaType, SizeUnit, PlanRecommendationStatus } from "@/db/schema";

type Area = {
  type: GrowingAreaType;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
};

function areaSizeLabel(area: Area): string | null {
  const sized = formatSizeValue(area.sizeValue, area.sizeUnit);
  if (sized) return sized;
  if (area.widthCm && area.lengthCm) {
    return `${area.widthCm}x${area.lengthCm}${area.depthCm ? `x${area.depthCm}` : ""}cm`;
  }
  return null;
}

type RecommendationGroup = {
  key: string;
  recommendationIds: string[];
  status: PlanRecommendationStatus;
  regenerationCount: number;
  crop: { emoji: string; name: string; verified: boolean; estimatedRetailPricePerKgGbp: number };
  variety: { id: string; name: string } | null;
  area: Area | null;
  nextArea: Area | null;
  count: number;
  reasoning: string;
  requiresPurchase: boolean;
  estimatedHarvestStart: string | null;
  estimatedHarvestEnd: string | null;
  isUnusualSuggestion: boolean;
};

// Same crop + same CURRENT growing-area type/size (e.g. three 20cm pots of
// spring onions, each its own recommendation row pointing at a distinct pot)
// reads as one repeated card otherwise — group them into a single "3 x 20cm
// pots of spring onions" listing instead. Grouping by *current* stage (not
// just "the crop") means two sibling instances that have progressed to
// different stages naturally end up in different groups, which is correct —
// they're genuinely in different states now even though they started alike.
// Status is part of the key too — without it, a freshly inserted `pending`
// replacement (from rejecting a *different* group) could land on the same
// crop+area-type+size as an already-`accepted` group and silently merge into
// one card with mixed statuses; this also guarantees every row in a
// displayed group shares one status, which the accept/reject buttons and the
// regenerating placeholder both depend on. regenerationCount is part of the
// key for the same reason — two rows sharing crop+area+size+status but
// having diverged retry counts (possible across separate reject batches)
// must not merge, since the displayed "N retries left" and the reject
// action's per-row retry-cap guard both assume every row in a group shares
// one count; without this a reject on such a merged card could silently
// half-succeed. variety.id is part of the key for the identical reason: two
// sibling recommendations of the same crop but different cultivars (e.g. a
// Moneymaker tomato pot and a Gardener's Delight tomato pot, same size,
// same status) are genuinely different picks and must never merge into one
// card — a reject on a merged card would discard both distinct variety
// choices and replace them with a single AI-picked one (see
// regenerateRecommendation.ts, which applies one replacement crop/variety
// uniformly across every instance in a rejected group). Harvest window
// widens to span every instance in the group (the AI staggers these on
// purpose to avoid a glut, so collapsing to one instance's dates would hide
// that spread).
function groupRecommendations(
  rows: {
    recommendation: { id: string; status: PlanRecommendationStatus; regenerationCount: number; reasoning: string; requiresPurchase: boolean; estimatedHarvestStart: string | null; estimatedHarvestEnd: string | null; isUnusualSuggestion: boolean };
    crop: { id: string; emoji: string; name: string; verified: boolean; estimatedRetailPricePerKgGbp: number };
    variety: { id: string; name: string } | null;
    area: Area | null;
    nextArea: Area | null;
  }[],
): RecommendationGroup[] {
  const groups: RecommendationGroup[] = [];
  const byKey = new Map<string, RecommendationGroup>();

  for (const { recommendation, crop, variety, area, nextArea } of rows) {
    const sizeKey = area ? (areaSizeLabel(area) ?? "unsized") : "none";
    // isUnusualSuggestion is part of the key for the same reason status/
    // regenerationCount are — an "unusual" pick is deliberately never the
    // same crop as anything else in the plan in practice, so this should
    // never actually fire, but it guards the same silent-merge risk if it
    // ever somehow coincided with an ordinary recommendation of that crop.
    const key = `${crop.id}|${variety?.id ?? "none"}|${area?.type ?? "none"}|${sizeKey}|${recommendation.status}|${recommendation.regenerationCount}|${recommendation.isUnusualSuggestion}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      existing.recommendationIds.push(recommendation.id);
      if (
        recommendation.estimatedHarvestStart &&
        (!existing.estimatedHarvestStart || recommendation.estimatedHarvestStart < existing.estimatedHarvestStart)
      ) {
        existing.estimatedHarvestStart = recommendation.estimatedHarvestStart;
      }
      if (
        recommendation.estimatedHarvestEnd &&
        (!existing.estimatedHarvestEnd || recommendation.estimatedHarvestEnd > existing.estimatedHarvestEnd)
      ) {
        existing.estimatedHarvestEnd = recommendation.estimatedHarvestEnd;
      }
      continue;
    }
    const group: RecommendationGroup = {
      key,
      recommendationIds: [recommendation.id],
      status: recommendation.status,
      regenerationCount: recommendation.regenerationCount,
      crop,
      variety,
      area,
      nextArea,
      count: 1,
      reasoning: recommendation.reasoning,
      requiresPurchase: recommendation.requiresPurchase,
      estimatedHarvestStart: recommendation.estimatedHarvestStart,
      estimatedHarvestEnd: recommendation.estimatedHarvestEnd,
      isUnusualSuggestion: recommendation.isUnusualSuggestion,
    };
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

function groupHeading(group: RecommendationGroup): string {
  const cropLabel = group.variety ? `${group.crop.name} (${group.variety.name})` : group.crop.name;
  if (group.count === 1) return cropLabel;
  if (!group.area) return `${group.count}× ${cropLabel}`;
  const size = areaSizeLabel(group.area);
  const typeLabel = growingAreaTypeLabels[group.area.type].toLowerCase();
  const sizedType = size ? `${size} ${typeLabel}s` : `${typeLabel}s`;
  return `${group.count} x ${sizedType} of ${cropLabel}`;
}

function nextStageHint(nextArea: Area | null): string | null {
  if (!nextArea) return null;
  const size = areaSizeLabel(nextArea);
  return `Next: ${growingAreaTypeEmoji[nextArea.type]} ${growingAreaTypeLabels[nextArea.type].toLowerCase()}${size ? ` (${size})` : ""}, once transplanted`;
}

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
        <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">AI Grow Plan</h1>
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6 shadow-card">
          <p className="flex items-center gap-2 font-display text-lg font-semibold">
            <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
            This is a membership feature.
          </p>
          <p className="mt-2 text-sm text-(--text-muted)">
            Subscribers get an AI-generated plan tailored to their plot, seeds, and experience —
            with reasoning, a shopping list for anything missing, and tasks added straight to the
            calendar.
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

  const latestPlan = await withTenant(tenant.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(growPlans)
      .where(eq(growPlans.userId, session.user.id))
      .orderBy(desc(growPlans.createdAt))
      .limit(1);
    return row;
  });

  // Any status counts (not just "available") — regenerating frees in_use
  // areas automatically, so the only real blocker is having none at all.
  const hasGrowingArea = await withTenant(tenant.id, async (tx) => {
    const [row] = await tx
      .select({ id: growingAreas.id })
      .from(growingAreas)
      .where(eq(growingAreas.userId, session.user.id))
      .limit(1);
    return Boolean(row);
  });

  const generationsToday = await getGrowPlanGenerationsToday(tenant.id, session.user.id);
  const generationsRemainingToday = Math.max(0, MAX_DAILY_GROW_PLAN_GENERATIONS - generationsToday);

  const groupedRecommendations = latestPlan?.status === "complete"
    ? await withTenant(tenant.id, async (tx) => {
        const recs = await tx
          .select({ recommendation: planRecommendations, crop: crops, variety: cropVarieties })
          .from(planRecommendations)
          .innerJoin(crops, eq(planRecommendations.cropId, crops.id))
          .leftJoin(cropVarieties, eq(planRecommendations.varietyId, cropVarieties.id))
          .where(
            and(
              eq(planRecommendations.growPlanId, latestPlan.id),
              inArray(planRecommendations.status, ["pending", "accepted", "regenerating"]),
            ),
          );

        const recIds = recs.map((r) => r.recommendation.id);
        const stageRows = recIds.length
          ? await tx
              .select({ stage: planRecommendationStages, area: growingAreas })
              .from(planRecommendationStages)
              .leftJoin(growingAreas, eq(planRecommendationStages.growingAreaId, growingAreas.id))
              .where(inArray(planRecommendationStages.planRecommendationId, recIds))
          : [];

        const stagesByRecommendation = new Map<string, typeof stageRows>();
        for (const row of stageRows) {
          const list = stagesByRecommendation.get(row.stage.planRecommendationId) ?? [];
          list.push(row);
          stagesByRecommendation.set(row.stage.planRecommendationId, list);
        }

        // "Where is this recommendation right now" is its active stage
        // (exactly one, given the linear progression); the immediate next
        // upcoming stage (if any) becomes the "next: ..." hint.
        const rows = recs.map(({ recommendation, crop, variety }) => {
          const stages = (stagesByRecommendation.get(recommendation.id) ?? []).sort(
            (a, b) => a.stage.stageIndex - b.stage.stageIndex,
          );
          const activeStage = stages.find((s) => s.stage.status === "active");
          const nextStage = activeStage
            ? stages.find(
                (s) => s.stage.status === "upcoming" && s.stage.stageIndex === activeStage.stage.stageIndex + 1,
              )
            : undefined;
          return {
            recommendation,
            crop,
            variety: variety ? { id: variety.id, name: variety.name } : null,
            area: activeStage?.area ?? null,
            nextArea: nextStage?.area ?? null,
          };
        });

        return groupRecommendations(rows);
      })
    : [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">AI Grow Plan</h1>

      {!latestPlan && !hasGrowingArea && (
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6 shadow-card">
          <p className="font-display text-lg font-semibold">Add a growing area to get started.</p>
          <p className="mt-2 text-sm text-(--text-muted)">
            The grow planner fills space you already have — pots, trays, planters, raised beds, or
            garden beds — rather than deciding what to buy. Add one on your garden page first.
          </p>
          <Link
            href="/garden"
            className="mt-4 inline-block rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
          >
            Go to your garden
          </Link>
        </div>
      )}

      {hasGrowingArea && !latestPlan && (
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6 shadow-card">
          <p className="text-sm text-(--text-muted)">
            Generate a plan based on your plot, seeds, favourite crops, and experience level.
          </p>
          {generationsRemainingToday > 0 ? (
            <>
              <div className="mt-4">
                <GeneratePlanButton
                  label="Generate my grow plan"
                  className="rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
                />
              </div>
              <p className="mt-2 text-xs text-(--text-muted)">
                {generationsRemainingToday} of {MAX_DAILY_GROW_PLAN_GENERATIONS} plan generations left today
              </p>
            </>
          ) : (
            <p className="mt-4 text-xs text-(--text-muted)">
              You&apos;ve used all {MAX_DAILY_GROW_PLAN_GENERATIONS} plan generations for today — come back tomorrow.
            </p>
          )}
        </div>
      )}

      {latestPlan?.status === "pending" && (
        <div className="mt-8">
          <JobInterstitial
            statusUrl={`/api/grow-plans/${latestPlan.id}/status`}
            message="Your grow plan is being put together…"
          />
        </div>
      )}

      {latestPlan?.status === "failed" && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="font-medium text-red-800">Something went wrong generating your plan.</p>
          <p className="mt-1 text-sm text-red-700">Please come back later and try again.</p>
          {hasGrowingArea && generationsRemainingToday > 0 && (
            <>
              <div className="mt-4">
                <GeneratePlanButton
                  label="Try again"
                  className="rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
                />
              </div>
              <p className="mt-2 text-xs text-red-700">
                {generationsRemainingToday} of {MAX_DAILY_GROW_PLAN_GENERATIONS} plan generations left today
              </p>
            </>
          )}
          {hasGrowingArea && generationsRemainingToday === 0 && (
            <p className="mt-4 text-xs text-red-700">
              You&apos;ve used all {MAX_DAILY_GROW_PLAN_GENERATIONS} plan generations for today — come back tomorrow.
            </p>
          )}
        </div>
      )}

      {latestPlan?.status === "complete" && (
        <div className="mt-8 flex flex-col gap-6">
          <div className="rounded-lg border border-black/10 border-t-4 border-t-(--brand-secondary) bg-white p-6 shadow-card">
            <p className="text-sm text-(--text-muted)">
              {(latestPlan.rawOutput as { summary?: string } | null)?.summary}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {groupedRecommendations.map((group, i) =>
              group.status === "regenerating" ? (
                <RegeneratingCard
                  key={group.key}
                  cropName={group.crop.name}
                  varietyName={group.variety?.name ?? null}
                  statusUrl={`/api/plan-recommendations/${group.recommendationIds[0]}/status`}
                />
              ) : (
                <FadeIn key={group.key} index={i}>
                <div className="rounded-lg border border-black/10 bg-white p-6 shadow-card">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-lg font-semibold">
                      {group.crop.emoji} {groupHeading(group)}
                    </p>
                    {group.isUnusualSuggestion && (
                      <span
                        className="whitespace-nowrap rounded-full bg-(--brand-primary)/15 px-2 py-0.5 text-xs text-(--brand-primary)"
                        title="You asked to try something new — this is one unusual, uncommon-in-UK-gardens pick"
                      >
                        Try something new
                      </span>
                    )}
                    {group.requiresPurchase && (
                      <span className="whitespace-nowrap rounded-full bg-(--brand-secondary)/40 px-2 py-0.5 text-xs">
                        Add to shopping list
                      </span>
                    )}
                    {!group.crop.verified && (
                      <span
                        className="whitespace-nowrap rounded-full bg-(--color-terracotta)/15 px-2 py-0.5 text-xs text-(--color-terracotta)"
                        title="This crop was added to the catalog by AI and hasn't been reviewed yet."
                      >
                        New, unverified
                      </span>
                    )}
                    <span
                      className="whitespace-nowrap rounded-full border border-black/15 px-2 py-0.5 text-xs text-(--text-muted)"
                      title="Estimated typical UK retail price — growing your own can save you this"
                    >
                      ~£{group.crop.estimatedRetailPricePerKgGbp.toFixed(2)}/kg to buy
                    </span>
                  </div>
                  {group.count === 1 && group.area && (
                    <p className="mt-1 text-xs text-(--text-muted)">
                      {growingAreaTypeEmoji[group.area.type]} {growingAreaTypeLabels[group.area.type]}
                      {areaSizeLabel(group.area) ? ` · ${areaSizeLabel(group.area)}` : ""}
                    </p>
                  )}
                  {nextStageHint(group.nextArea) && (
                    <p className="mt-1 text-xs text-(--color-terracotta)">{nextStageHint(group.nextArea)}</p>
                  )}
                  <p className="mt-2 text-sm text-(--text-muted)">{group.reasoning}</p>
                  {group.estimatedHarvestStart && group.estimatedHarvestEnd && (
                    <p className="mt-2 text-xs text-(--text-muted)">
                      Estimated harvest: {group.estimatedHarvestStart} – {group.estimatedHarvestEnd}
                    </p>
                  )}
                  <RecommendationActionButtons
                    recommendationIds={group.recommendationIds}
                    status={group.status}
                    retriesRemaining={Math.max(0, MAX_RECOMMENDATION_REGENERATIONS - group.regenerationCount)}
                  />
                </div>
                </FadeIn>
              ),
            )}
          </div>

          <div className="flex flex-col items-start gap-4">
            <Link
              href="/calendar"
              className="rounded-full bg-black/5 px-4 py-2 text-sm text-(--text-heading) hover:bg-black/10 active:scale-95 transition"
            >
              View tasks on calendar →
            </Link>
            {hasGrowingArea &&
              !groupedRecommendations.some((g) => g.status === "regenerating") &&
              (generationsRemainingToday > 0 ? (
                <GeneratePlanButton
                  label="Generate a new plan"
                  className="rounded-full bg-black/5 px-4 py-2 text-sm text-(--text-heading) hover:bg-black/10 active:scale-95 transition"
                />
              ) : (
                <span className="text-xs text-(--text-muted)">
                  All {MAX_DAILY_GROW_PLAN_GENERATIONS} plan generations used today
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
