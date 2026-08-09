import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { db } from "@/db/client";
import { crops, seedInventory } from "@/db/schema";
import { SeedsForm } from "./SeedsForm";

export default async function SeedsStepPage() {
  const session = await auth();
  const tenant = await getCurrentTenant();

  const [allCrops, owned] = await Promise.all([
    db.select().from(crops).orderBy(asc(crops.sortOrder)),
    withTenant(tenant.id, async (tx) =>
      tx.select().from(seedInventory).where(eq(seedInventory.userId, session!.user.id)),
    ),
  ]);

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">Any seeds already in the shed?</h1>
      <p className="text-sm text-(--text-muted)">
        Step 5 of 6 — optional. We&apos;ll prioritise seeds you already own when planning.
      </p>
      <div className="mt-4">
        <SeedsForm
          crops={allCrops.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji }))}
          initialRows={owned.map((o) => ({ cropId: o.cropId, quantityLabel: o.quantityLabel }))}
        />
      </div>
    </div>
  );
}
