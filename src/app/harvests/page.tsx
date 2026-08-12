import { redirect } from "next/navigation";
import { eq, desc, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { db } from "@/db/client";
import { harvestLog, crops, cropVarieties } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { HarvestsView } from "./HarvestsView";

export default async function HarvestsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const [harvests, allCrops, allVarieties] = await Promise.all([
    withTenant(tenant.id, async (tx) =>
      tx
        .select({ harvest: harvestLog, crop: crops, variety: cropVarieties })
        .from(harvestLog)
        .innerJoin(crops, eq(harvestLog.cropId, crops.id))
        .leftJoin(cropVarieties, eq(harvestLog.varietyId, cropVarieties.id))
        .where(eq(harvestLog.userId, session.user.id))
        .orderBy(desc(harvestLog.harvestedAt)),
    ),
    db.select().from(crops).orderBy(asc(crops.sortOrder)),
    db.select().from(cropVarieties),
  ]);

  const varietiesByCropId = new Map<string, { id: string; name: string }[]>();
  for (const v of allVarieties) {
    const list = varietiesByCropId.get(v.cropId) ?? [];
    list.push({ id: v.id, name: v.name });
    varietiesByCropId.set(v.cropId, list);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Harvests</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        Log what you&apos;ve picked — this builds up history for next year&apos;s planning.
      </p>
      <div className="mt-8">
        <HarvestsView
          harvests={harvests.map((r) => ({
            id: r.harvest.id,
            cropId: r.crop.id,
            cropName: r.crop.name,
            cropEmoji: r.crop.emoji,
            varietyName: r.variety?.name ?? null,
            quantity: r.harvest.quantity,
            unit: r.harvest.unit,
            harvestedAt: r.harvest.harvestedAt,
            notes: r.harvest.notes,
          }))}
          crops={allCrops.map((c) => ({
            id: c.id,
            name: c.name,
            emoji: c.emoji,
            varieties: varietiesByCropId.get(c.id) ?? [],
          }))}
        />
      </div>
    </div>
  );
}
