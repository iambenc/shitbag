import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { db } from "@/db/client";
import { shoppingListItems, crops, equipmentTypes, partnerLinks } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { ShoppingListView } from "./ShoppingListView";

export default async function ShoppingListPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const [{ items, tenantEquipmentTypes, links }, allCrops] = await Promise.all([
    withTenant(tenant.id, async (tx) => {
      const [items, tenantEquipmentTypes, links] = await Promise.all([
        tx
          .select({ item: shoppingListItems, crop: crops, equipmentType: equipmentTypes })
          .from(shoppingListItems)
          .leftJoin(crops, eq(shoppingListItems.cropId, crops.id))
          .leftJoin(equipmentTypes, eq(shoppingListItems.equipmentTypeId, equipmentTypes.id))
          .where(eq(shoppingListItems.userId, session.user.id))
          .orderBy(asc(shoppingListItems.createdAt)),
        tx.select().from(equipmentTypes).where(eq(equipmentTypes.tenantId, tenant.id)).orderBy(asc(equipmentTypes.sortOrder)),
        tx.select().from(partnerLinks),
      ]);
      return { items, tenantEquipmentTypes, links };
    }),
    db.select().from(crops).orderBy(asc(crops.sortOrder)),
  ]);

  // "Last one wins" if a crop/type somehow has more than one link — same
  // simplification already used by /garden and /onboarding/equipment.
  const linksByCropId = new Map(
    links.filter((l) => l.cropId).map((l) => [l.cropId as string, { label: l.label, url: l.url }]),
  );
  const linksByEquipmentTypeId = new Map(
    links.filter((l) => l.equipmentTypeId).map((l) => [l.equipmentTypeId as string, { label: l.label, url: l.url }]),
  );

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Shopping list</h1>
      <p className="mt-2 text-sm text-(--text-muted)">Seeds and supplies to pick up.</p>
      <div className="mt-8">
        <ShoppingListView
          items={items.map((r) => ({
            id: r.item.id,
            cropId: r.item.cropId,
            cropName: r.crop?.name ?? null,
            cropEmoji: r.crop?.emoji ?? null,
            equipmentTypeId: r.item.equipmentTypeId,
            equipmentTypeName: r.equipmentType?.name ?? null,
            freeText: r.item.freeText,
            quantityLabel: r.item.quantityLabel,
            status: r.item.status,
            source: r.item.source,
            partnerLink:
              (r.item.cropId && linksByCropId.get(r.item.cropId)) ||
              (r.item.equipmentTypeId && linksByEquipmentTypeId.get(r.item.equipmentTypeId)) ||
              null,
          }))}
          crops={allCrops.map((c) => ({
            id: c.id,
            name: c.name,
            emoji: c.emoji,
            partnerLink: linksByCropId.get(c.id) ?? null,
          }))}
          equipmentTypes={tenantEquipmentTypes.map((t) => ({
            id: t.id,
            name: t.name,
            partnerLink: linksByEquipmentTypeId.get(t.id) ?? null,
          }))}
        />
      </div>
    </div>
  );
}
