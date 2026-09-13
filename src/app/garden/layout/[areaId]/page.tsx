import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { eq, and, or, isNull, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { growingAreas, planRecommendations, planRecommendationStages, crops } from "@/db/schema";
import { HEIGHT_TYPES } from "@/lib/garden/layout";
import { CONTAINER_GROWING_AREA_TYPES } from "@/lib/garden/equipmentMapping";
import { growingAreaTypeLabels, growingAreaTypeEmoji } from "@/lib/garden/labels";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { LayoutCanvas } from "../LayoutCanvas";

export default async function StructureLayoutPage({ params }: { params: Promise<{ areaId: string }> }) {
  if (!FEATURE_FLAGS.layoutPlanning) notFound();

  const session = await auth();
  if (!session?.user) redirect("/login");

  const { areaId } = await params;
  const tenant = await getCurrentTenant();

  const { structure, areas, occupancy } = await withTenant(tenant.id, async (tx) => {
    const [structure] = await tx
      .select()
      .from(growingAreas)
      .where(and(eq(growingAreas.id, areaId), eq(growingAreas.userId, session.user.id)));
    if (!structure) return { structure: null, areas: [], occupancy: [] };

    // Children already placed inside this structure, plus every container
    // the user owns but hasn't placed anywhere yet (main plot or any other
    // structure) — the same "placed + suggestable" mix layout/page.tsx
    // hands LayoutCanvas for the main plot, just scoped to this structure's
    // own footprint instead.
    const areas = await tx
      .select()
      .from(growingAreas)
      .where(
        and(
          eq(growingAreas.userId, session.user.id),
          or(
            eq(growingAreas.parentGrowingAreaId, areaId),
            and(isNull(growingAreas.parentGrowingAreaId), isNull(growingAreas.positionXCm), inArray(growingAreas.type, CONTAINER_GROWING_AREA_TYPES)),
          ),
        ),
      );

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

    return { structure, areas, occupancy };
  });

  if (!structure || !HEIGHT_TYPES.includes(structure.type)) notFound();

  const occupantByAreaId = new Map(occupancy.map((o) => [o.areaId, { cropName: o.cropName, cropEmoji: o.cropEmoji }]));
  const label = growingAreaTypeLabels[structure.type];
  const emoji = growingAreaTypeEmoji[structure.type];

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <Link href="/garden/layout" className="text-sm text-(--brand-primary) underline">
        &larr; Your plot
      </Link>
      <h1 className="mt-2 flex items-center gap-2 font-display text-3xl font-semibold text-(--brand-primary)">
        Inside your {label} <span aria-hidden="true">{emoji}</span>
      </h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        Place pots, seed trays, grow bags, and planters inside this {label.toLowerCase()} — growing
        space here gets the same frost protection and extra warmth the {label.toLowerCase()} itself
        gives.
      </p>

      {(!structure.widthCm || !structure.lengthCm) ? (
        <div className="mt-8 rounded-lg border border-black/10 bg-white p-6 shadow-card">
          <p className="text-sm text-(--text-muted)">
            This {label.toLowerCase()} doesn&rsquo;t have a width and length set yet — add them via{" "}
            <Link href="/my-shed" className="text-(--brand-primary) underline">
              My Shed
            </Link>{" "}
            before placing anything inside it.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <LayoutCanvas
            plotWidthCm={structure.widthCm}
            plotLengthCm={structure.lengthCm}
            containerAreaId={structure.id}
            areas={areas.map((a) => ({
              id: a.id,
              type: a.type,
              sizeValue: a.sizeValue,
              sizeUnit: a.sizeUnit,
              widthCm: a.widthCm,
              lengthCm: a.lengthCm,
              depthCm: a.depthCm,
              heightCm: a.heightCm,
              status: a.status,
              // A container fetched here because it's owned-but-unplaced
              // elsewhere still carries whatever position it last had
              // outside this structure — never possible, since the query
              // above only ever includes such rows when positionXCm is
              // already null, but a child of THIS structure could carry a
              // real in-structure position. Passed through as-is either way.
              positionXCm: a.parentGrowingAreaId === structure.id ? a.positionXCm : null,
              positionYCm: a.parentGrowingAreaId === structure.id ? a.positionYCm : null,
              rotationDeg: a.rotationDeg,
              occupant: occupantByAreaId.get(a.id) ?? null,
            }))}
          />
        </div>
      )}
    </div>
  );
}
