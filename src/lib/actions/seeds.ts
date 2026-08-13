"use server";

import { z } from "zod";
import { eq, and, gte, count, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { seedInventory, crops, cropVarieties, seedPacketScans } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { getCropFacts } from "@/lib/ai/agents/cropFacts";
import { getVarietyFacts, type ParentCropFacts } from "@/lib/ai/agents/varietyFacts";
import { scanSeedPacket } from "@/lib/ai/agents/seedPacketScanner";
import { ALLOWED_IMAGE_TYPES, MAX_PHOTO_BYTES } from "@/lib/storage";
import { startOfTodayLocal } from "@/lib/dates";
import { MAX_DAILY_SEED_ADDITIONS, MAX_DAILY_SEED_PACKET_SCANS } from "@/lib/ai/limits";

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
// crop name triggers a real cropFacts call, and an unrecognized variety name
// triggers a second, separate getVarietyFacts call — up to two AI calls per
// single add), not to limit the separate, already-bounded onboarding seeds
// step.
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

// Counts every scan attempt regardless of outcome — the vision call is the
// cost driver, not whether the result was useful, same "count the attempt,
// not the success" reasoning as getPlantDiagnosesToday.
export async function getSeedPacketScansToday(tenantId: string, userId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ count: count() })
      .from(seedPacketScans)
      .where(and(eq(seedPacketScans.userId, userId), gte(seedPacketScans.createdAt, startOfTodayLocal())));
    return row.count;
  });
}

export type SeedPacketScanClientResult = {
  cropName: string;
  varietyName: string | null;
  seedCount: number | null;
  seedCountIsEstimate: boolean;
  notes: string | null;
};

export type ScanSeedPacketState = { error?: string; scan?: SeedPacketScanClientResult };

// One-shot autofill, not a persisted proposal: the extracted fields are
// returned straight to the client to pre-fill /seeds' add-seed form
// (SeedsView.tsx) — the user reviews/edits every field there before
// addSeedAction (a completely separate call) ever writes anything. The
// photo itself is never stored — converted to a Buffer, sent to the vision
// call, then discarded; only a bare counter row (seedPacketScans) persists,
// purely to back the daily cap below.
export async function scanSeedPacketAction(formData: FormData): Promise<ScanSeedPacketState> {
  const { userId, tenantId } = await requireSessionAndTenant();

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo of the seed packet first." };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: "That photo is too large (max 8MB)." };
  }
  const extension = ALLOWED_IMAGE_TYPES[file.type];
  if (!extension) {
    return { error: "Please upload a JPEG, PNG, WebP, or GIF image." };
  }

  const scansToday = await getSeedPacketScansToday(tenantId, userId);
  if (scansToday >= MAX_DAILY_SEED_PACKET_SCANS) {
    return { error: `You've scanned ${MAX_DAILY_SEED_PACKET_SCANS} packets today — come back tomorrow, or add this one by typing it in.` };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await scanSeedPacket(tenantId, { imageBuffer: buffer, contentType: file.type });

  await withTenant(tenantId, async (tx) => {
    await tx.insert(seedPacketScans).values({ tenantId, userId });
  });

  // Confirmed live (not just theorized): given a photo with no seed packet
  // in it at all, the model correctly declines to invent a crop rather than
  // hallucinating one — cropName comes back null with an explanation in
  // notes. Surface that as a normal error rather than passing a missing
  // crop name through to the form.
  if (!result.output.cropName) {
    return { error: result.output.notes ?? "Couldn't find a seed packet in that photo — try a clearer picture, or add it manually." };
  }

  return {
    scan: {
      cropName: result.output.cropName,
      varietyName: result.output.varietyName,
      seedCount: result.output.seedCount,
      seedCountIsEstimate: result.output.seedCountIsEstimate,
      notes: result.output.notes,
    },
  };
}

const addSeedSchema = z.object({
  cropName: z.string().trim().min(1, "Enter what you bought").max(100),
  // How many individual seeds, not packets/grams — this is what the grow
  // planner's estimatedSeedsUsed deduction (toggleTaskCompleteAction) is
  // denominated in, so the two need to share a unit.
  seedCount: z.coerce.number().int().positive("Enter how many seeds").max(100000),
  // Optional — a user may not know/care which cultivar they bought. Empty
  // string (the common case, field left blank) treated the same as absent.
  varietyName: z.string().trim().max(100).optional(),
});

export type CreatedSeed = {
  id: string;
  cropId: string;
  cropName: string;
  cropEmoji: string;
  varietyId: string | null;
  varietyName: string | null;
  quantityLabel: string;
  seedCount: number;
  cropIsNew: boolean;
  varietyIsNew: boolean;
};

export type AddSeedState = { error?: string; seed?: CreatedSeed };

export async function addSeedAction(_prevState: AddSeedState, formData: FormData): Promise<AddSeedState> {
  const parsed = addSeedSchema.safeParse({
    cropName: formData.get("cropName"),
    seedCount: formData.get("seedCount"),
    varietyName: formData.get("varietyName") || undefined,
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

  // Variety resolution runs after the crop above, using its now-final id —
  // a variety can't be resolved against a crop that doesn't exist yet. Same
  // typed-slug-fast-path / AI-call / corrected-slug-dedupe shape as the crop
  // resolution just above, scoped additionally by cropId (crop_varieties'
  // unique constraint is per-crop, not global — see its own schema comment).
  let varietyId: string | null = null;
  let varietyName: string | null = null;
  let varietyIsNew = false;
  const typedVarietyName = parsed.data.varietyName;
  if (typedVarietyName) {
    const typedVarietySlug = slugify(typedVarietyName);
    if (typedVarietySlug) {
      let [variety] = await db
        .select()
        .from(cropVarieties)
        .where(and(eq(cropVarieties.cropId, crop.id), eq(cropVarieties.slug, typedVarietySlug)));

      if (!variety) {
        const parentFacts: ParentCropFacts = {
          name: crop.name,
          category: crop.category,
          spacingCm: crop.spacingCm,
          daysToHarvestMin: crop.daysToHarvestMin,
          daysToHarvestMax: crop.daysToHarvestMax,
          estimatedRetailPricePerKgGbp: crop.estimatedRetailPricePerKgGbp,
        };
        const varietyFacts = await getVarietyFacts(tenantId, crop.name, typedVarietyName, parentFacts);
        const correctedVarietySlug = slugify(varietyFacts.output.name) || typedVarietySlug;
        [variety] = await db
          .select()
          .from(cropVarieties)
          .where(and(eq(cropVarieties.cropId, crop.id), eq(cropVarieties.slug, correctedVarietySlug)));

        if (!variety) {
          varietyIsNew = true;
          await db
            .insert(cropVarieties)
            .values({
              cropId: crop.id,
              slug: correctedVarietySlug,
              name: varietyFacts.output.name,
              daysToHarvestMin: varietyFacts.output.daysToHarvestMin,
              daysToHarvestMax: varietyFacts.output.daysToHarvestMax,
              spacingCm: varietyFacts.output.spacingCm,
              growthHabit: varietyFacts.output.growthHabit,
              diseaseResistanceNotes: varietyFacts.output.diseaseResistanceNotes,
              characteristics: varietyFacts.output.characteristics,
              estimatedRetailPricePerKgGbp: varietyFacts.output.estimatedRetailPricePerKgGbp,
              verified: false,
              sourceProvider: varietyFacts.provider,
              sourceModel: varietyFacts.model,
            })
            .onConflictDoNothing({ target: [cropVarieties.cropId, cropVarieties.slug] });

          [variety] = await db
            .select()
            .from(cropVarieties)
            .where(and(eq(cropVarieties.cropId, crop.id), eq(cropVarieties.slug, correctedVarietySlug)));
        }
      }
      varietyId = variety.id;
      varietyName = variety.name;
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
        varietyId,
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
      varietyId,
      varietyName,
      quantityLabel: seed.quantityLabel,
      seedCount: parsed.data.seedCount,
      cropIsNew,
      varietyIsNew,
    },
  };
}

export async function deleteSeedAction(seedId: string): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx.delete(seedInventory).where(and(eq(seedInventory.id, seedId), eq(seedInventory.userId, userId)));
  });
}

const updateSeedCountSchema = z.coerce.number().int().min(0, "Enter how many seeds are left").max(100000);

export type UpdateSeedCountResult = { error?: string; quantityLabel?: string };

// Lets the user correct the running count themselves — e.g. after using some
// seeds outside the app, or converting an onboarding row's vague "1 packet"
// into a real number. Deliberately separate from toggleTaskCompleteAction's
// own automatic deduction (src/lib/actions/tasks.ts): that's the grow
// planner's estimate debiting stock as tasks are completed; this is the user
// directly asserting what's actually left, which simply overwrites whatever
// the running total currently is — no bucket/variety reconciliation needed,
// since the user is stating the real number, not adjusting it incrementally.
// 0 is a valid, meaningful value (matches the floor the automatic deduction
// already clamps to) — not treated as "delete this row".
export async function updateSeedCountAction(seedId: string, newCount: number): Promise<UpdateSeedCountResult> {
  const parsed = updateSeedCountSchema.safeParse(newCount);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter how many seeds are left." };
  }

  const { userId, tenantId } = await requireSessionAndTenant();
  const quantityLabel = `${parsed.data} seed${parsed.data === 1 ? "" : "s"}`;
  const updated = await withTenant(tenantId, async (tx) => {
    return tx
      .update(seedInventory)
      .set({ seedCount: parsed.data, quantityLabel })
      .where(and(eq(seedInventory.id, seedId), eq(seedInventory.userId, userId)))
      .returning({ id: seedInventory.id });
  });
  if (updated.length === 0) {
    return { error: "Couldn't find that seed entry." };
  }

  return { quantityLabel };
}
