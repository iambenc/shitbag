import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { db } from "@/db/client";
import { crops, userFavoriteCrops } from "@/db/schema";
import { CropSwipeDeck } from "./CropSwipeDeck";

export default async function CropsStepPage() {
  const session = await auth();
  const tenant = await getCurrentTenant();

  const [allCrops, favorites] = await Promise.all([
    db.select().from(crops).orderBy(asc(crops.sortOrder)),
    withTenant(tenant.id, async (tx) =>
      tx
        .select({ cropId: userFavoriteCrops.cropId })
        .from(userFavoriteCrops)
        .where(eq(userFavoriteCrops.userId, session!.user.id)),
    ),
  ]);

  const alreadySwiped = new Set(favorites.map((f) => f.cropId));
  const remaining = allCrops
    .filter((c) => !alreadySwiped.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, category: c.category }));

  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">What do you want to grow?</h1>
      <p className="text-sm text-(--text-muted)">
        Step 2 of 6 — swipe right (or tap ♥) for crops you&apos;d like, left (or ✕) to skip.
      </p>
      <div className="mt-8">
        <CropSwipeDeck crops={remaining} />
      </div>
    </div>
  );
}
