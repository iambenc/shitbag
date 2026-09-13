import "server-only";
import { eq, and, ne } from "drizzle-orm";
import { harvestLog, userProfiles, crops } from "@/db/schema";
import type { Database } from "@/db/client";

// Below this many distinct opted-in growers, a crop simply doesn't appear in
// the result at all — a "grown by 1 other gardener" count in a small tenant
// is effectively an identity leak, not a real aggregate. This threshold is
// what keeps the signal genuinely anonymous, not the opt-in alone.
const MIN_GROWERS_TO_SURFACE = 2;

export type CommunityCropPopularity = { cropSlug: string; growerCount: number };

/**
 * Purely informational input for the grow planner (see growPlanner.ts's
 * COMMUNITY HARVEST POPULARITY prompt section) — the only place in this
 * codebase that reads another user's harvestLog rows. Gated entirely on
 * userProfiles.shareHarvestDataForCommunity (opt-in, off by default), since
 * harvestLog itself has no visibility/privacy field of its own. Must be
 * called from inside withTenant — relies on RLS to scope both tables to the
 * caller's tenant, same as every other tenant-scoped query in this app.
 */
export async function getCommunityCropPopularity(
  tx: Database,
  { excludeUserId }: { excludeUserId: string },
): Promise<CommunityCropPopularity[]> {
  const rows = await tx
    .select({ cropSlug: crops.slug, userId: harvestLog.userId })
    .from(harvestLog)
    .innerJoin(userProfiles, eq(harvestLog.userId, userProfiles.userId))
    .innerJoin(crops, eq(harvestLog.cropId, crops.id))
    .where(and(eq(userProfiles.shareHarvestDataForCommunity, true), ne(harvestLog.userId, excludeUserId)));

  const growersByCropSlug = new Map<string, Set<string>>();
  for (const row of rows) {
    const growers = growersByCropSlug.get(row.cropSlug) ?? new Set<string>();
    growers.add(row.userId);
    growersByCropSlug.set(row.cropSlug, growers);
  }

  return [...growersByCropSlug.entries()]
    .map(([cropSlug, growers]) => ({ cropSlug, growerCount: growers.size }))
    .filter((c) => c.growerCount >= MIN_GROWERS_TO_SURFACE);
}
