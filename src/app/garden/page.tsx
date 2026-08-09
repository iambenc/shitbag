import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { userEquipment, equipmentTypes, partnerLinks, growingAreas } from "@/db/schema";
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

  const { equipmentRows, areas, types, links } = await withTenant(tenant.id, async (tx) => {
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
    return { equipmentRows, areas, types, links };
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

  const placeable = equipmentRows
    .filter((r) => r.type.slug in SLUG_TO_GROWING_AREA_TYPE)
    .map((r) => ({
      userEquipmentId: r.equipment.id,
      name: r.type.name,
      type: SLUG_TO_GROWING_AREA_TYPE[r.type.slug],
      sizeLabel: r.equipment.sizeLabel,
      widthCm: r.equipment.widthCm,
      lengthCm: r.equipment.lengthCm,
      depthCm: r.equipment.depthCm,
      quantityOwned: r.equipment.quantity,
      placedCount: placedCountByEquipmentId.get(r.equipment.id) ?? 0,
    }));

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">Your growing space</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        Tell us which of your equipment is actually set up and ready to grow in right now.
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
              sizeLabel: r.equipment.sizeLabel,
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
