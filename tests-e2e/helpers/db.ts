import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Direct-SQL test helper for state that has no UI path in this app (there's
 * no self-serve "upgrade to paid" flow to click through — real upgrades go
 * via Stripe checkout, which isn't something a regression pack should be
 * driving). Mirrors the same dev-mode-simulation shape
 * startCheckoutAction uses. Only ever targets pw-test-% accounts (see
 * helpers/auth.ts), never real data.
 */
export async function upgradeToPaid(email: string): Promise<void> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const tenants = await sql`select id from tenants`;
    for (const tenant of tenants) {
      await sql.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenant.id}, true)`;
        const users = await tx`select id from users where email = ${email}`;
        if (users.length === 0) return;
        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + 30);
        await tx`
          update subscriptions
          set tier = 'paid', status = 'active', current_period_end = ${periodEnd.toISOString()}
          where user_id = ${users[0].id}
        `;
      });
    }
  } finally {
    await sql.end();
  }
}
