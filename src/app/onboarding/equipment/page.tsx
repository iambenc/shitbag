import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { equipmentTypes, partnerLinks, userEquipment } from "@/db/schema";
import { EquipmentPicker } from "@/components/EquipmentPicker";
import { saveEquipmentAction } from "@/lib/actions/onboarding/equipment";

export default async function EquipmentStepPage() {
  const session = await auth();
  const tenant = await getCurrentTenant();

  const { types, links, owned } = await withTenant(tenant.id, async (tx) => {
    const [types, links, owned] = await Promise.all([
      tx.select().from(equipmentTypes).where(eq(equipmentTypes.tenantId, tenant.id)).orderBy(asc(equipmentTypes.sortOrder)),
      tx.select().from(partnerLinks).where(eq(partnerLinks.tenantId, tenant.id)),
      tx.select().from(userEquipment).where(eq(userEquipment.userId, session!.user.id)),
    ]);
    return { types, links, owned };
  });

  const linksByType = new Map(links.map((l) => [l.equipmentTypeId, l]));

  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">What equipment do you have?</h1>
      <p className="text-sm text-(--text-muted)">Step 4 of 6</p>
      <div className="mt-4">
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
          initialRows={owned.map((o) => ({
            id: o.id,
            equipmentTypeId: o.equipmentTypeId,
            quantity: o.quantity,
            sizeValue: o.sizeValue,
            sizeUnit: o.sizeUnit,
            widthCm: o.widthCm,
            lengthCm: o.lengthCm,
            depthCm: o.depthCm,
          }))}
          action={saveEquipmentAction}
        />
      </div>
    </div>
  );
}
