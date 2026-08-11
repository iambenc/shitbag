import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { db } from "@/db/client";
import { seedInventory, crops } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { getSeedAdditionsToday } from "@/lib/actions/seeds";
import { MAX_DAILY_SEED_ADDITIONS } from "@/lib/ai/limits";
import { SeedsView } from "./SeedsView";

export default async function SeedsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const [seeds, additionsToday, allCrops] = await Promise.all([
    withTenant(tenant.id, (tx) =>
      tx
        .select({ seed: seedInventory, crop: crops })
        .from(seedInventory)
        .innerJoin(crops, eq(seedInventory.cropId, crops.id))
        .where(eq(seedInventory.userId, session.user.id))
        .orderBy(desc(seedInventory.createdAt)),
    ),
    getSeedAdditionsToday(tenant.id, session.user.id),
    // Global, un-tenanted catalog (same table addSeedAction resolves/backfills
    // against) — every existing name, including AI-backfilled ones from
    // other users' unrecognized seeds, autocompletes the input below.
    db.select({ name: crops.name }).from(crops),
  ]);

  const remainingToday = Math.max(0, MAX_DAILY_SEED_ADDITIONS - additionsToday);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Seed inventory</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        Add anything you&rsquo;ve bought from a shop — type what it&rsquo;s called even if it&rsquo;s
        unusual and not already in our catalog. Everything here is used to prioritise your AI grow
        plan: seeds you already own always come before anything you&rsquo;d need to buy.
      </p>
      <div className="mt-8">
        <SeedsView
          seeds={seeds.map((r) => ({
            id: r.seed.id,
            cropName: r.crop.name,
            cropEmoji: r.crop.emoji,
            quantityLabel: r.seed.quantityLabel,
            source: r.seed.source,
          }))}
          remainingToday={remainingToday}
          cropNames={[...new Set(allCrops.map((c) => c.name))].sort((a, b) => a.localeCompare(b))}
        />
      </div>
    </div>
  );
}
