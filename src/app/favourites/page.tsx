import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { db } from "@/db/client";
import { crops, userFavoriteCrops } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { FavouriteCropsGrid } from "./FavouriteCropsGrid";

export default async function FavouritesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const [allCrops, favorites] = await Promise.all([
    db.select().from(crops).orderBy(asc(crops.sortOrder)),
    withTenant(tenant.id, (tx) =>
      tx
        .select({ cropId: userFavoriteCrops.cropId, liked: userFavoriteCrops.liked })
        .from(userFavoriteCrops)
        .where(eq(userFavoriteCrops.userId, session.user.id)),
    ),
  ]);

  const likedByCropId = new Map(favorites.map((f) => [f.cropId, f.liked]));

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">Favourite crops</h1>
      <p className="mt-2 text-sm text-(--text-muted)">
        Tap the heart to update what you&rsquo;re most excited to grow — this feeds your AI grow
        plan.
      </p>
      <div className="mt-8">
        <FavouriteCropsGrid
          crops={allCrops.map((c) => ({
            id: c.id,
            name: c.name,
            emoji: c.emoji,
            category: c.category,
            liked: likedByCropId.get(c.id) ?? false,
          }))}
        />
      </div>
    </div>
  );
}
