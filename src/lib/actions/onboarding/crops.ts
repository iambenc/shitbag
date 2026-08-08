"use server";

import { sql } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { userFavoriteCrops } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";

export async function recordCropSwipeAction(cropId: string, liked: boolean): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx
      .insert(userFavoriteCrops)
      .values({ tenantId, userId, cropId, liked })
      .onConflictDoUpdate({
        target: [userFavoriteCrops.userId, userFavoriteCrops.cropId],
        set: { liked, createdAt: sql`now()` },
      });
  });
}
