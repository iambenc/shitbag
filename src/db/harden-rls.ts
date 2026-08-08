/**
 * Grants the runtime `edurnity_app` role DML access to whatever tables exist,
 * sets default privileges so future migrations (run as the owner role) keep
 * granting access automatically, and turns on FORCE ROW LEVEL SECURITY for
 * every table that has RLS enabled — without FORCE, the owner role (which is
 * who `drizzle-kit push` runs migrations as) would bypass its own policies.
 *
 * Run after every `pnpm db:push` / `pnpm db:generate` + migrate.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function main() {
  const ownerUrl = process.env.DATABASE_URL_OWNER;
  if (!ownerUrl) throw new Error("DATABASE_URL_OWNER is not set");

  const sql = postgres(ownerUrl, { onnotice: () => {} });

  await sql`grant usage on schema public to edurnity_app`;
  await sql`grant select, insert, update, delete on all tables in schema public to edurnity_app`;
  await sql`grant usage, select on all sequences in schema public to edurnity_app`;
  await sql`alter default privileges in schema public grant select, insert, update, delete on tables to edurnity_app`;
  await sql`alter default privileges in schema public grant usage, select on sequences to edurnity_app`;

  const rlsTables = await sql<{ tablename: string }[]>`
    select relname as tablename
    from pg_class
    where relrowsecurity = true and relkind = 'r'
  `;
  for (const { tablename } of rlsTables) {
    await sql.unsafe(`alter table "${tablename}" force row level security`);
  }

  console.log(
    `Hardened RLS: granted edurnity_app access, forced RLS on [${rlsTables
      .map((t) => t.tablename)
      .join(", ")}]`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
