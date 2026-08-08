import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { tenants, tenantPlans, crops, equipmentTypes, partnerLinks } from "./schema";
import { cropSeeds } from "./seed-data/crops";
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
          secondaryColor: "#e8c34a",
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
    `Seeded platform tenant "edurnity" (${tenant.id}) — ${newCrops.length} new crops, ${newTypeCount} new equipment types`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
