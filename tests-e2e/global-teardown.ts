import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Deletes every user this test run's helpers created (see
 * helpers/auth.ts's TEST_EMAIL_PREFIX) so the local dev database doesn't
 * accumulate one throwaway account per run. Scoped strictly to that email
 * prefix — never touches the demo account or any other real data. Runs
 * once after the whole suite, regardless of pass/fail (Playwright always
 * invokes globalTeardown).
 */
export default async function globalTeardown() {
  const postgres = (await import("postgres")).default;
  const { TEST_EMAIL_PREFIX } = await import("./helpers/auth");

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const deleted = await tx`delete from users where email like ${TEST_EMAIL_PREFIX + "%"} returning id`;
        if (deleted.length > 0) {
          console.log(`[global-teardown] removed ${deleted.length} test user(s) from tenant ${tenant.id}`);
        }
      });
    }
  } finally {
    await sql.end();
  }
}
