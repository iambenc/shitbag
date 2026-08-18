import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { growingAreas, planRecommendations, planRecommendationStages, crops } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { LayoutCanvas } from "./LayoutCanvas";

export default async function GardenLayoutPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  // Individual rows, not aggregated up to the equipment-row level the way
  // /garden's own `placeable` view does — the drag canvas needs real
  // per-row identity (id, position) to persist against, which that
  // aggregated shape can't provide.
  const { areas, occupancy } = await withTenant(tenant.id, async (tx) => {
    const areas = await tx.select().from(growingAreas).where(eq(growingAreas.userId, session.user.id));

    const claimedAreaIds = areas.filter((a) => a.status === "in_use" || a.status === "reserved").map((a) => a.id);
    const occupancy = claimedAreaIds.length
      ? await tx
          .select({
            areaId: planRecommendationStages.growingAreaId,
            cropName: crops.name,
            cropEmoji: crops.emoji,
          })
          .from(planRecommendationStages)
          .innerJoin(planRecommendations, eq(planRecommendationStages.planRecommendationId, planRecommendations.id))
          .innerJoin(crops, eq(planRecommendations.cropId, crops.id))
          .where(inArray(planRecommendationStages.growingAreaId, claimedAreaIds))
      : [];

    return { areas, occupancy };
  });

  const occupantByAreaId = new Map(occupancy.map((o) => [o.areaId, { cropName: o.cropName, cropEmoji: o.cropEmoji }]));

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <Link href="/garden" className="text-sm text-(--brand-primary) underline">
        &larr; Your growing space
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold text-(--brand-primary)">Plot planner</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        We&rsquo;ll suggest a layout for your growing areas — drag anything to confirm it, adjust it, or
        set it aside.
      </p>

      <div className="mt-8">
        <LayoutCanvas
          plotWidthCm={profile.plotWidthCm}
          plotLengthCm={profile.plotLengthCm}
          areas={areas.map((a) => ({
            id: a.id,
            type: a.type,
            sizeValue: a.sizeValue,
            sizeUnit: a.sizeUnit,
            widthCm: a.widthCm,
            lengthCm: a.lengthCm,
            depthCm: a.depthCm,
            status: a.status,
            positionXCm: a.positionXCm,
            positionYCm: a.positionYCm,
            occupant: occupantByAreaId.get(a.id) ?? null,
          }))}
        />
      </div>
    </div>
  );
}
