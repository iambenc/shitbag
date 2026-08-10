import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { db } from "@/db/client";
import { shoppingListItems, crops, equipmentTypes } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { ShoppingListView } from "./ShoppingListView";

export default async function ShoppingListPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const [{ items, tenantEquipmentTypes }, allCrops] = await Promise.all([
    withTenant(tenant.id, async (tx) => {
      const [items, tenantEquipmentTypes] = await Promise.all([
        tx
          .select({ item: shoppingListItems, crop: crops, equipmentType: equipmentTypes })
          .from(shoppingListItems)
          .leftJoin(crops, eq(shoppingListItems.cropId, crops.id))
          .leftJoin(equipmentTypes, eq(shoppingListItems.equipmentTypeId, equipmentTypes.id))
          .where(eq(shoppingListItems.userId, session.user.id))
          .orderBy(asc(shoppingListItems.createdAt)),
        tx.select().from(equipmentTypes).where(eq(equipmentTypes.tenantId, tenant.id)).orderBy(asc(equipmentTypes.sortOrder)),
      ]);
      return { items, tenantEquipmentTypes };
    }),
    db.select().from(crops).orderBy(asc(crops.sortOrder)),
  ]);

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
          }))}
          crops={allCrops.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))}
          equipmentTypes={tenantEquipmentTypes.map((t) => ({ id: t.id, name: t.name }))}
        />
      </div>
    </div>
  );
}
