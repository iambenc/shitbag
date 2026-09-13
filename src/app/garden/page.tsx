import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { userEquipment, equipmentTypes, growingAreas } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { SLUG_TO_GROWING_AREA_TYPE, CONTAINER_GROWING_AREA_TYPES } from "@/lib/garden/equipmentMapping";
import { HEIGHT_TYPES } from "@/lib/garden/layout";
import { growingAreaBaseLabel } from "@/lib/garden/labels";
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

  // One card per owned structure INSTANCE (not equipment type) — a
  // structure is always top-level (only a container can have a
  // parentGrowingAreaId), matching /garden/layout's own per-instance
  // treatment rather than My Shed's aggregated equipment-row shape.
  const structureAreas = areas.filter((a) => HEIGHT_TYPES.includes(a.type));
  const structureBaseLabels = structureAreas.map((a) => growingAreaBaseLabel(a));
  const structureLabelTotals = new Map<string, number>();
  for (const label of structureBaseLabels) structureLabelTotals.set(label, (structureLabelTotals.get(label) ?? 0) + 1);
  const structureLabelSeen = new Map<string, number>();

  const structures = structureAreas.map((structure, i) => {
    const baseLabel = structureBaseLabels[i];
    let displayLabel = baseLabel;
    if ((structureLabelTotals.get(baseLabel) ?? 0) > 1) {
      const n = (structureLabelSeen.get(baseLabel) ?? 0) + 1;
      structureLabelSeen.set(baseLabel, n);
      displayLabel = `${baseLabel} ${n}`;
    }
    return { id: structure.id, type: structure.type, displayLabel };
  });

  // One entry per owned PLANTING EQUIPMENT (container) row — structures
  // aren't included here at all: owning one already creates its real
  // growing-space instance automatically (applyEquipmentRows' existing
  // auto-placement), so they need no owned/placed accounting of their own
  // here, only the per-structure sections above. mainGardenCount and
  // assignedByStructure are both real counts of actual growingAreas rows
  // (mainGardenCount = parentGrowingAreaId IS NULL, i.e. placed but not
  // inside any structure), not derived from userEquipment.quantity alone —
  // this is the single source of truth GrowingAreaManager lifts into one
  // shared client state so every stepper and the Inventory section's
  // remaining-quota figure all stay consistent with each other live.
  const containers = equipmentRows
    .filter((r) => CONTAINER_GROWING_AREA_TYPES.includes(SLUG_TO_GROWING_AREA_TYPE[r.type.slug]))
    .map((r) => {
      const sourced = areas.filter((a) => a.sourceUserEquipmentId === r.equipment.id);
      const mainGardenCount = sourced.filter((a) => a.parentGrowingAreaId === null).length;
      const assignedByStructure: Record<string, number> = {};
      for (const structure of structures) {
        assignedByStructure[structure.id] = sourced.filter((a) => a.parentGrowingAreaId === structure.id).length;
      }
      return {
        userEquipmentId: r.equipment.id,
        name: r.type.name,
        sizeValue: r.equipment.sizeValue,
        sizeUnit: r.equipment.sizeUnit,
        widthCm: r.equipment.widthCm,
        lengthCm: r.equipment.lengthCm,
        depthCm: r.equipment.depthCm,
        heightCm: r.equipment.heightCm,
        quantityOwned: r.equipment.quantity,
        mainGardenCount,
        assignedByStructure,
      };
    });

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Your growing space</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        See what&rsquo;s placed in Your Plot and each garden structure, and how much of your
        planting equipment is still unallocated. Add new pots, trays, beds, and tools in{" "}
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
        <GrowingAreaManager containers={containers} structures={structures} />
      </div>
    </div>
  );
}
