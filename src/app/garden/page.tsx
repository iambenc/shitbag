import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { userEquipment, equipmentTypes, growingAreas } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { SLUG_TO_GROWING_AREA_TYPE } from "@/lib/garden/equipmentMapping";
import { GrowingAreaManager } from "./GrowingAreaManager";

export default async function GardenPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const { equipmentRows, areas } = await withTenant(tenant.id, async (tx) => {
    const [equipmentRows, areas] = await Promise.all([
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
    ]);

    return { equipmentRows, areas };
  });

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
      sizeValue: r.equipment.sizeValue,
      sizeUnit: r.equipment.sizeUnit,
      widthCm: r.equipment.widthCm,
      lengthCm: r.equipment.lengthCm,
      depthCm: r.equipment.depthCm,
      heightCm: r.equipment.heightCm,
      quantityOwned: r.equipment.quantity,
      placedCount: placedCountByEquipmentId.get(r.equipment.id) ?? 0,
    }));

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Your growing space</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        Place your owned equipment as growing space, or plan where everything sits. Add new pots,
        trays, beds, and tools in{" "}
        <Link href="/my-shed" className="text-(--brand-primary) underline">
          My Shed
        </Link>
        .
      </p>

      <Link
        href="/garden/estimate"
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white p-4 shadow-card hover:border-(--brand-primary)/40 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
      >
        <div>
          <p className="font-display text-lg font-semibold">📷 Estimate from photos</p>
          <p className="mt-1 text-sm text-(--text-muted)">
            Photograph your growing space and let AI propose the areas — review before anything&rsquo;s
            added.
          </p>
        </div>
      </Link>

      <div className="mt-10">
        <GrowingAreaManager equipment={placeable} />
      </div>
    </div>
  );
}
