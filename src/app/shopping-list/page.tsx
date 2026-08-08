import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { db } from "@/db/client";
import { shoppingListItems, crops } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { ShoppingListView } from "./ShoppingListView";

export default async function ShoppingListPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const [items, allCrops] = await Promise.all([
    withTenant(tenant.id, async (tx) =>
      tx
        .select({ item: shoppingListItems, crop: crops })
        .from(shoppingListItems)
        .leftJoin(crops, eq(shoppingListItems.cropId, crops.id))
        .where(eq(shoppingListItems.userId, session.user.id))
        .orderBy(asc(shoppingListItems.createdAt)),
    ),
    db.select().from(crops).orderBy(asc(crops.sortOrder)),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">Shopping list</h1>
      <p className="mt-2 text-sm text-[#1f2a1f]/70">Seeds and supplies to pick up.</p>
      <div className="mt-8">
        <ShoppingListView
          items={items.map((r) => ({
            id: r.item.id,
            cropId: r.item.cropId,
            cropName: r.crop?.name ?? null,
            cropEmoji: r.crop?.emoji ?? null,
            freeText: r.item.freeText,
            quantityLabel: r.item.quantityLabel,
            status: r.item.status,
          }))}
          crops={allCrops.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))}
        />
      </div>
    </div>
  );
}
