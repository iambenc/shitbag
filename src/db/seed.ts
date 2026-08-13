import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { tenants, tenantPlans, crops, cropVarieties, equipmentTypes, partnerLinks } from "./schema";
import { cropSeeds } from "./seed-data/crops";
import { cropVarietySeeds } from "./seed-data/crop-varieties";
import { equipmentTypeSeeds } from "./seed-data/equipment";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL_OWNER;
  if (!url) throw new Error("DATABASE_URL_OWNER is not set");

  const sql = postgres(url, { max: 1 });
  const db = drizzle(sql);

  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, "edurnity"));
  const tenant =
    existing ??
    (
      await db
        .insert(tenants)
        .values({
          slug: "edurnity",
          displayName: "Edurnity",
          primaryColor: "#2f6b3c",
          secondaryColor: "#e8b23d",
        })
        .returning()
    )[0];

  const [existingPlan] = await db
    .select()
    .from(tenantPlans)
    .where(eq(tenantPlans.tenantId, tenant.id));
  if (!existingPlan) {
    await db.insert(tenantPlans).values({
      tenantId: tenant.id,
      monthlyAmountPence: 500,
      currency: "gbp",
    });
  }

  const existingCrops = await db.select({ slug: crops.slug }).from(crops);
  const existingCropSlugs = new Set(existingCrops.map((c) => c.slug));
  const newCrops = cropSeeds
    .filter((c) => !existingCropSlugs.has(c.slug))
    .map((c, i) => ({ ...c, sortOrder: existingCropSlugs.size + i }));
  if (newCrops.length > 0) {
    await db.insert(crops).values(newCrops);
  }

  // crop_varieties' uniqueness is per-crop (cropId, slug), not global — see
  // its own schema comment — so "already exists" has to be checked as a
  // cropId+slug pair, not slug alone (unlike crops.slug, which is globally
  // unique). Resolves cropSlug against the FULL current crop list (not just
  // newCrops above), since a variety can reference a crop that already
  // existed before this run.
  const allCrops = await db.select({ id: crops.id, slug: crops.slug }).from(crops);
  const cropIdBySlug = new Map(allCrops.map((c) => [c.slug, c.id]));
  const existingVarieties = await db.select({ cropId: cropVarieties.cropId, slug: cropVarieties.slug }).from(cropVarieties);
  const existingVarietyKeys = new Set(existingVarieties.map((v) => `${v.cropId}|${v.slug}`));
  const newVarieties = cropVarietySeeds
    .map((v) => {
      const cropId = cropIdBySlug.get(v.cropSlug);
      if (!cropId) {
        console.warn(`Skipping variety seed "${v.slug}" — unknown crop slug "${v.cropSlug}"`);
        return null;
      }
      return { ...v, cropId };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .filter((v) => !existingVarietyKeys.has(`${v.cropId}|${v.slug}`));
  if (newVarieties.length > 0) {
    await db.insert(cropVarieties).values(
      newVarieties.map((v) => ({
        cropId: v.cropId,
        slug: v.slug,
        name: v.name,
        daysToHarvestMin: v.daysToHarvestMin,
        daysToHarvestMax: v.daysToHarvestMax,
        spacingCm: v.spacingCm,
        growthHabit: v.growthHabit,
        diseaseResistanceNotes: v.diseaseResistanceNotes,
        characteristics: v.characteristics,
        estimatedRetailPricePerKgGbp: v.estimatedRetailPricePerKgGbp,
      })),
    );
  }

  const existingTypes = await db
    .select({ slug: equipmentTypes.slug })
    .from(equipmentTypes)
    .where(eq(equipmentTypes.tenantId, tenant.id));
  const existingTypeSlugs = new Set(existingTypes.map((t) => t.slug));
  let newTypeCount = 0;
  for (const [i, seed] of equipmentTypeSeeds.entries()) {
    if (existingTypeSlugs.has(seed.slug)) continue;
    const [type] = await db
      .insert(equipmentTypes)
      .values({
        tenantId: tenant.id,
        slug: seed.slug,
        name: seed.name,
        category: seed.category,
        sortOrder: i,
      })
      .returning();
    await db.insert(partnerLinks).values({
      tenantId: tenant.id,
      equipmentTypeId: type.id,
      label: seed.partnerLinkLabel,
      url: seed.partnerLinkUrl,
    });
    newTypeCount++;
  }

  console.log(
    `Seeded platform tenant "edurnity" (${tenant.id}) — ${newCrops.length} new crops, ${newVarieties.length} new crop varieties, ${newTypeCount} new equipment types`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
