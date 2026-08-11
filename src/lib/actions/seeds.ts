"use server";

import { z } from "zod";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { seedInventory, crops } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { getCropFacts } from "@/lib/ai/agents/cropFacts";
import { startOfTodayLocal } from "@/lib/dates";
import { MAX_DAILY_SEED_ADDITIONS } from "@/lib/ai/limits";

// Mirrors generateGrowPlan.ts's own slugify — not shared, deliberately: that
// function's resolve-new-crops step is Inngest-wrapped, batches several
// AI-proposed crops per call, and is proven/already Plan-reviewed. This is a
// single-crop, plain-server-action version of the same "find or create by
// name" idea; not worth risking that working code for one more caller of a
// few lines of logic, same reasoning this codebase already applies to
// Inngest gather-context steps.
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Counts only rows this action itself created (source: "purchased") — the
// cap exists to bound this action's own worst-case AI cost (an unrecognized
// crop name triggers a real cropFacts call), not to limit the separate,
// already-bounded onboarding seeds step.
export async function getSeedAdditionsToday(tenantId: string, userId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ count: count() })
      .from(seedInventory)
      .where(
        and(
          eq(seedInventory.userId, userId),
          eq(seedInventory.source, "purchased"),
          gte(seedInventory.createdAt, startOfTodayLocal()),
        ),
      );
    return row.count;
  });
}

const addSeedSchema = z.object({
  cropName: z.string().trim().min(1, "Enter what you bought").max(100),
  // How many individual seeds, not packets/grams — this is what the grow
  // planner's estimatedSeedsUsed deduction (toggleTaskCompleteAction) is
  // denominated in, so the two need to share a unit.
  seedCount: z.coerce.number().int().positive("Enter how many seeds").max(100000),
});

export type CreatedSeed = {
  id: string;
  cropId: string;
  cropName: string;
  cropEmoji: string;
  quantityLabel: string;
  seedCount: number;
  cropIsNew: boolean;
};

export type AddSeedState = { error?: string; seed?: CreatedSeed };

export async function addSeedAction(_prevState: AddSeedState, formData: FormData): Promise<AddSeedState> {
  const parsed = addSeedSchema.safeParse({
    cropName: formData.get("cropName"),
    seedCount: formData.get("seedCount"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  }

  const { userId, tenantId } = await requireSessionAndTenant();

  const additionsToday = await getSeedAdditionsToday(tenantId, userId);
  if (additionsToday >= MAX_DAILY_SEED_ADDITIONS) {
    return { error: `You've added ${MAX_DAILY_SEED_ADDITIONS} seed types today — come back tomorrow.` };
  }

  const typedSlug = slugify(parsed.data.cropName);
  if (!typedSlug) {
    return { error: "Enter what you bought." };
  }

  // crops is the global, un-tenanted catalog (same table generateGrowPlan.ts's
  // resolve-new-crops backfills into) — plain db client, not withTenant, same
  // as every other reader/writer of this table.
  let [crop] = await db.select().from(crops).where(eq(crops.slug, typedSlug));
  let cropIsNew = false;

  if (!crop) {
    const [{ maxSortOrder }] = await db
      .select({ maxSortOrder: sql<number>`coalesce(max(${crops.sortOrder}), 0)` })
      .from(crops);

    const facts = await getCropFacts(tenantId, parsed.data.cropName);
    // The catalog stores the AI's corrected name/spelling (facts.output.name)
    // rather than echoing back whatever the user typed — re-slugify from
    // that corrected name, not the raw input, so e.g. "tomatoe" and
    // "Tomatoes" both converge on the same "tomato" row instead of each
    // creating their own near-duplicate. Check for that slug again here
    // (not just the typed one above): another user's differently-spelled
    // input may have already resolved to the same canonical crop.
    const correctedSlug = slugify(facts.output.name) || typedSlug;
    [crop] = await db.select().from(crops).where(eq(crops.slug, correctedSlug));

    if (!crop) {
      cropIsNew = true;
      await db
        .insert(crops)
        .values({
          slug: correctedSlug,
          name: facts.output.name,
          category: facts.output.category,
          emoji: facts.output.emoji,
          spacingCm: facts.output.spacingCm,
          soilDepthCm: facts.output.soilDepthCm,
          sowIndoorFromMonth: facts.output.sowIndoorFromMonth,
          sowIndoorToMonth: facts.output.sowIndoorToMonth,
          sowOutdoorFromMonth: facts.output.sowOutdoorFromMonth,
          sowOutdoorToMonth: facts.output.sowOutdoorToMonth,
          daysToHarvestMin: facts.output.daysToHarvestMin,
          daysToHarvestMax: facts.output.daysToHarvestMax,
          supportsSuccessionSowing: facts.output.supportsSuccessionSowing,
          estimatedRetailPricePerKgGbp: facts.output.estimatedRetailPricePerKgGbp,
          feedingNotes: facts.output.feedingNotes,
          sortOrder: maxSortOrder + 1,
          verified: false,
          sourceProvider: facts.provider,
          sourceModel: facts.model,
        })
        .onConflictDoNothing({ target: crops.slug });

      [crop] = await db.select().from(crops).where(eq(crops.slug, correctedSlug));
    }
  }

  const quantityLabel = `${parsed.data.seedCount} seed${parsed.data.seedCount === 1 ? "" : "s"}`;
  const seed = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(seedInventory)
      .values({
        tenantId,
        userId,
        cropId: crop.id,
        quantityLabel,
        seedCount: parsed.data.seedCount,
        source: "purchased",
      })
      .returning();
    return row;
  });

  return {
    seed: {
      id: seed.id,
      cropId: crop.id,
      cropName: crop.name,
      cropEmoji: crop.emoji,
      quantityLabel: seed.quantityLabel,
      seedCount: parsed.data.seedCount,
      cropIsNew,
    },
  };
}

export async function deleteSeedAction(seedId: string): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx.delete(seedInventory).where(and(eq(seedInventory.id, seedId), eq(seedInventory.userId, userId)));
  });
}
