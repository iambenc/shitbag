import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { equipmentTypes, partnerLinks, userEquipment } from "@/db/schema";
import { EquipmentPicker } from "./EquipmentPicker";

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
      <h1 className="text-2xl font-semibold text-(--brand-primary)">What equipment do you have?</h1>
      <p className="text-sm text-[#1f2a1f]/70">Step 4 of 6</p>
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
            equipmentTypeId: o.equipmentTypeId,
            quantity: o.quantity,
            sizeLabel: o.sizeLabel,
            widthCm: o.widthCm,
            lengthCm: o.lengthCm,
            depthCm: o.depthCm,
          }))}
        />
      </div>
    </div>
  );
}
