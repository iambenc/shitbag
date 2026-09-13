import { redirect } from "next/navigation";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { db } from "@/db/client";
import {
  harvestLog,
  crops,
  cropVarieties,
  photoJournalEntries,
  planRecommendationStages,
  planRecommendations,
  growPlans,
} from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { HarvestsView } from "./HarvestsView";

export default async function HarvestsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const [harvests, plantedCropIds] = await Promise.all([
    withTenant(tenant.id, async (tx) =>
      tx
        .select({ harvest: harvestLog, crop: crops, variety: cropVarieties, photo: photoJournalEntries })
        .from(harvestLog)
        .innerJoin(crops, eq(harvestLog.cropId, crops.id))
        .leftJoin(cropVarieties, eq(harvestLog.varietyId, cropVarieties.id))
        .leftJoin(photoJournalEntries, eq(photoJournalEntries.harvestLogId, harvestLog.id))
        .where(eq(harvestLog.userId, session.user.id))
        .orderBy(desc(harvestLog.harvestedAt)),
    ),
    // "Planted" = an ACCEPTED plan-recommendation (the user's explicit "yes,
    // I'm growing this" — a still-"pending" suggestion could yet be
    // rejected, so it doesn't count even though its first stage already
    // exists internally) whose stage actually reached active (currently in
    // the ground) or done (already grown/harvested to completion) — an
    // "upcoming" stage is still just a future placeholder, not yet planted.
    // Unioned with crops the user has already logged a harvest for
    // (harvestLog itself is definitive proof it was planted, even if the
    // underlying growing-area/stage records have since been cleaned up —
    // e.g. the area was deleted), so a user can always log a follow-up
    // harvest of something they've grown before.
    withTenant(tenant.id, async (tx) => {
      const [stageRows, harvestCropRows] = await Promise.all([
        tx
          .select({ cropId: planRecommendations.cropId })
          .from(planRecommendationStages)
          .innerJoin(planRecommendations, eq(planRecommendationStages.planRecommendationId, planRecommendations.id))
          .innerJoin(growPlans, eq(planRecommendations.growPlanId, growPlans.id))
          .where(
            and(
              eq(growPlans.userId, session.user.id),
              inArray(planRecommendationStages.status, ["active", "done"]),
              eq(planRecommendations.status, "accepted"),
            ),
          ),
        tx.select({ cropId: harvestLog.cropId }).from(harvestLog).where(eq(harvestLog.userId, session.user.id)),
      ]);
      return new Set([...stageRows.map((r) => r.cropId), ...harvestCropRows.map((r) => r.cropId)]);
    }),
  ]);

  const [allCrops, allVarieties] = await Promise.all([
    db.select().from(crops).orderBy(asc(crops.sortOrder)),
    db.select().from(cropVarieties),
  ]);
  const plantedCrops = allCrops.filter((c) => plantedCropIds.has(c.id));

  const varietiesByCropId = new Map<string, { id: string; name: string }[]>();
  for (const v of allVarieties) {
    const list = varietiesByCropId.get(v.cropId) ?? [];
    list.push({ id: v.id, name: v.name });
    varietiesByCropId.set(v.cropId, list);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Harvests</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        Log what you&apos;ve picked — this builds up history for next year&apos;s planning.
      </p>
      <div className="mt-8">
        <HarvestsView
          shareHarvestDataForCommunity={profile.shareHarvestDataForCommunity}
          harvests={harvests.map((r) => ({
            id: r.harvest.id,
            cropId: r.crop.id,
            cropName: r.crop.name,
            cropEmoji: r.crop.emoji,
            varietyName: r.variety?.name ?? null,
            quantity: r.harvest.quantity,
            unit: r.harvest.unit,
            harvestedAt: r.harvest.harvestedAt,
            notes: r.harvest.notes,
            photoId: r.photo?.id ?? null,
            photoUrl: r.photo?.url ?? null,
            photoVisibility: r.photo?.visibility ?? null,
          }))}
          crops={plantedCrops.map((c) => ({
            id: c.id,
            name: c.name,
            emoji: c.emoji,
            varieties: varietiesByCropId.get(c.id) ?? [],
          }))}
        />
      </div>
    </div>
  );
}
