import { redirect } from "next/navigation";
import { eq, asc, desc, isNotNull, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { db } from "@/db/client";
import { seedInventory, crops, cropVarieties, userEquipment, equipmentTypes, partnerLinks } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { getSeedAdditionsToday, getSeedPacketScansToday } from "@/lib/actions/seeds";
import { updateEquipmentAction } from "@/lib/actions/garden/equipment";
import { MAX_DAILY_SEED_ADDITIONS, MAX_DAILY_SEED_PACKET_SCANS } from "@/lib/ai/limits";
import { MyShedView } from "./MyShedView";

export default async function MyShedPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const [seedsData, equipmentData, allCrops, allVarieties] = await Promise.all([
    withTenant(tenant.id, async (tx) => {
      const [seeds, additionsToday, scansToday] = await Promise.all([
        tx
          .select({ seed: seedInventory, crop: crops, variety: cropVarieties })
          .from(seedInventory)
          .innerJoin(crops, eq(seedInventory.cropId, crops.id))
          .leftJoin(cropVarieties, eq(seedInventory.varietyId, cropVarieties.id))
          .where(eq(seedInventory.userId, session.user.id))
          .orderBy(desc(seedInventory.createdAt)),
        getSeedAdditionsToday(tenant.id, session.user.id),
        getSeedPacketScansToday(tenant.id, session.user.id),
      ]);
      return { seeds, additionsToday, scansToday };
    }),
    withTenant(tenant.id, async (tx) => {
      const [equipmentRows, types, links] = await Promise.all([
        tx
          .select({ equipment: userEquipment, type: equipmentTypes })
          .from(userEquipment)
          .innerJoin(equipmentTypes, eq(userEquipment.equipmentTypeId, equipmentTypes.id))
          .where(eq(userEquipment.userId, session.user.id))
          .orderBy(asc(equipmentTypes.sortOrder)),
        tx.select().from(equipmentTypes).where(eq(equipmentTypes.tenantId, tenant.id)).orderBy(asc(equipmentTypes.sortOrder)),
        tx
          .select()
          .from(partnerLinks)
          .where(and(eq(partnerLinks.tenantId, tenant.id), isNotNull(partnerLinks.equipmentTypeId))),
      ]);
      return { equipmentRows, types, links };
    }),
    // Global, un-tenanted catalog (same table addSeedAction resolves/backfills
    // against) — every existing name, including AI-backfilled ones from
    // other users' unrecognized seeds, autocompletes the input below.
    db.select({ name: crops.name }).from(crops),
    // Same for varieties — not scoped to any particular crop (the crop name
    // input is itself free text, so exact scoping isn't reliable pre-
    // resolution); same simplification the crop-name autocomplete makes.
    db.select({ name: cropVarieties.name }).from(cropVarieties),
  ]);

  const remainingToday = Math.max(0, MAX_DAILY_SEED_ADDITIONS - seedsData.additionsToday);
  const scansRemainingToday = Math.max(0, MAX_DAILY_SEED_PACKET_SCANS - seedsData.scansToday);

  const linksByType = new Map(equipmentData.links.map((l) => [l.equipmentTypeId, l]));

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <MyShedView
        seeds={seedsData.seeds.map((r) => ({
          id: r.seed.id,
          cropName: r.crop.name,
          cropEmoji: r.crop.emoji,
          cropCategory: r.crop.category,
          varietyName: r.variety?.name ?? null,
          quantityLabel: r.seed.quantityLabel,
          seedCount: r.seed.seedCount,
          source: r.seed.source,
          addedIso: r.seed.createdAt.toISOString().slice(0, 10),
        }))}
        remainingToday={remainingToday}
        scansRemainingToday={scansRemainingToday}
        cropNames={[...new Set(allCrops.map((c) => c.name))].sort((a, b) => a.localeCompare(b))}
        varietyNames={[...new Set(allVarieties.map((v) => v.name))].sort((a, b) => a.localeCompare(b))}
        equipmentRows={equipmentData.equipmentRows.map((r) => ({
          id: r.equipment.id,
          equipmentTypeId: r.equipment.equipmentTypeId,
          slug: r.type.slug,
          typeName: r.type.name,
          category: r.type.category,
          quantity: r.equipment.quantity,
          sizeValue: r.equipment.sizeValue,
          sizeUnit: r.equipment.sizeUnit,
          widthCm: r.equipment.widthCm,
          lengthCm: r.equipment.lengthCm,
          depthCm: r.equipment.depthCm,
          heightCm: r.equipment.heightCm,
        }))}
        equipmentTypes={equipmentData.types.map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          category: t.category,
          partnerLink: linksByType.has(t.id)
            ? { label: linksByType.get(t.id)!.label, url: linksByType.get(t.id)!.url }
            : null,
        }))}
        equipmentAction={updateEquipmentAction}
      />
    </div>
  );
}
