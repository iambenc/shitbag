import { redirect } from "next/navigation";
import { eq, asc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import {
  userEquipment,
  equipmentTypes,
  partnerLinks,
  growingAreas,
  planRecommendations,
  planRecommendationStages,
  crops,
} from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { SLUG_TO_GROWING_AREA_TYPE } from "@/lib/garden/equipmentMapping";
import { EquipmentPicker } from "@/components/EquipmentPicker";
import { updateEquipmentAction } from "@/lib/actions/garden/equipment";
import { GrowingAreaManager } from "./GrowingAreaManager";

export default async function GardenPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const { equipmentRows, areas, types, links, occupancy } = await withTenant(tenant.id, async (tx) => {
    const [equipmentRows, areas, types, links] = await Promise.all([
      tx
        .select({ equipment: userEquipment, type: equipmentTypes })
        .from(userEquipment)
        .innerJoin(equipmentTypes, eq(userEquipment.equipmentTypeId, equipmentTypes.id))
        .where(eq(userEquipment.userId, session.user.id))
        .orderBy(asc(equipmentTypes.sortOrder)),
      tx
        .select()
        .from(growingAreas)
        .where(eq(growingAreas.userId, session.user.id))
        .orderBy(asc(growingAreas.createdAt)),
      tx.select().from(equipmentTypes).where(eq(equipmentTypes.tenantId, tenant.id)).orderBy(asc(equipmentTypes.sortOrder)),
      tx.select().from(partnerLinks).where(eq(partnerLinks.tenantId, tenant.id)),
    ]);

    // What's currently growing (in_use areas) or earmarked for later
    // (reserved areas, awaiting a transplant task) — lets the picker show
    // the effect of a generated plan, not just an opaque status flag. Joins
    // through planRecommendationStages, not planRecommendations directly,
    // since a recommendation can now span several stages/areas over its
    // lifecycle.
    const claimedAreaIds = areas.filter((a) => a.status === "in_use" || a.status === "reserved").map((a) => a.id);
    const occupancy = claimedAreaIds.length
      ? await tx
          .select({
            areaId: planRecommendationStages.growingAreaId,
            stageStatus: planRecommendationStages.status,
            cropName: crops.name,
            cropEmoji: crops.emoji,
          })
          .from(planRecommendationStages)
          .innerJoin(planRecommendations, eq(planRecommendationStages.planRecommendationId, planRecommendations.id))
          .innerJoin(crops, eq(planRecommendations.cropId, crops.id))
          .where(inArray(planRecommendationStages.growingAreaId, claimedAreaIds))
      : [];

    return { equipmentRows, areas, types, links, occupancy };
  });

  const linksByType = new Map(links.map((l) => [l.equipmentTypeId, l]));

  const placedCountByEquipmentId = new Map<string, number>();
  for (const area of areas) {
    if (!area.sourceUserEquipmentId) continue;
    placedCountByEquipmentId.set(
      area.sourceUserEquipmentId,
      (placedCountByEquipmentId.get(area.sourceUserEquipmentId) ?? 0) + 1,
    );
  }

  const occupantByAreaId = new Map(occupancy.map((o) => [o.areaId, { cropName: o.cropName, cropEmoji: o.cropEmoji }]));
  const occupantsByEquipmentId = new Map<string, { cropName: string; cropEmoji: string }[]>();
  const reservedByEquipmentId = new Map<string, { cropName: string; cropEmoji: string }[]>();
  for (const area of areas) {
    if (!area.sourceUserEquipmentId) continue;
    if (area.status !== "in_use" && area.status !== "reserved") continue;
    const occupant = occupantByAreaId.get(area.id);
    if (!occupant) continue;
    const targetMap = area.status === "in_use" ? occupantsByEquipmentId : reservedByEquipmentId;
    const list = targetMap.get(area.sourceUserEquipmentId) ?? [];
    list.push(occupant);
    targetMap.set(area.sourceUserEquipmentId, list);
  }

  const placeable = equipmentRows
    .filter((r) => r.type.slug in SLUG_TO_GROWING_AREA_TYPE)
    .map((r) => ({
      userEquipmentId: r.equipment.id,
      name: r.type.name,
      type: SLUG_TO_GROWING_AREA_TYPE[r.type.slug],
      sizeValue: r.equipment.sizeValue,
      sizeUnit: r.equipment.sizeUnit,
      widthCm: r.equipment.widthCm,
      lengthCm: r.equipment.lengthCm,
      depthCm: r.equipment.depthCm,
      quantityOwned: r.equipment.quantity,
      placedCount: placedCountByEquipmentId.get(r.equipment.id) ?? 0,
      occupants: occupantsByEquipmentId.get(r.equipment.id) ?? [],
      reserved: reservedByEquipmentId.get(r.equipment.id) ?? [],
    }));

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Your growing space</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        Newly added equipment is automatically ready to grow in — adjust the counts below if you
        want to hold some back.
      </p>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-(--text-muted)">Your equipment</h2>
        <div className="mt-3">
          <EquipmentPicker
            types={types.map((t) => ({
              id: t.id,
              slug: t.slug,
              name: t.name,
              category: t.category,
              partnerLink: linksByType.has(t.id)
                ? { label: linksByType.get(t.id)!.label, url: linksByType.get(t.id)!.url }
                : null,
            }))}
            initialRows={equipmentRows.map((r) => ({
              id: r.equipment.id,
              equipmentTypeId: r.equipment.equipmentTypeId,
              quantity: r.equipment.quantity,
              sizeValue: r.equipment.sizeValue,
              sizeUnit: r.equipment.sizeUnit,
              widthCm: r.equipment.widthCm,
              lengthCm: r.equipment.lengthCm,
              depthCm: r.equipment.depthCm,
            }))}
            action={updateEquipmentAction}
            submitLabel="Save equipment"
            pendingLabel="Saving…"
          />
        </div>
      </div>

      <div className="mt-10">
        <GrowingAreaManager equipment={placeable} />
      </div>
    </div>
  );
}
