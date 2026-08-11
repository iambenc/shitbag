import { sql, isNotNull } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { equipmentTypes, partnerLinks, userEquipment } from "@/db/schema";
import { requireTenantAdmin } from "@/lib/actions/shared";
import { EquipmentView } from "./EquipmentView";

export default async function AdminEquipmentPage() {
  const { tenantId } = await requireTenantAdmin();

  const { types, links, usageCounts } = await withTenant(tenantId, async (tx) => {
    const types = await tx.select().from(equipmentTypes).orderBy(equipmentTypes.sortOrder);
    // Equipment-type links only — crop-linked rows belong to /admin/crops.
    const links = await tx.select().from(partnerLinks).where(isNotNull(partnerLinks.equipmentTypeId));
    const usageCounts = await tx
      .select({ equipmentTypeId: userEquipment.equipmentTypeId, count: sql<number>`count(*)::int` })
      .from(userEquipment)
      .groupBy(userEquipment.equipmentTypeId);
    return { types, links, usageCounts };
  });

  const usageByType = new Map(usageCounts.map((u) => [u.equipmentTypeId, u.count]));

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="font-display text-lg font-semibold">Equipment &amp; partner links</h2>
      <p className="mt-1 text-sm text-(--text-muted)">
        Equipment types gardeners can record in their inventory, and where to buy what they don&rsquo;t
        have.
      </p>
      <div className="mt-8">
        <EquipmentView
          types={types.map((t) => ({ ...t, usageCount: usageByType.get(t.id) ?? 0 }))}
          // Narrowed by the isNotNull filter above; EquipmentTypeRow's
          // PartnerLink type predates polymorphic partnerLinks and only
          // ever handles the equipment-type case.
          links={links.map((l) => ({ ...l, equipmentTypeId: l.equipmentTypeId as string }))}
        />
      </div>
    </div>
  );
}
