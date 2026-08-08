import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { tenants, tenantPlans } from "./schema";

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

  console.log(`Seeded platform tenant "edurnity" (${tenant.id})`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
