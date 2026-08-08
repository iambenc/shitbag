import { sql } from "drizzle-orm";
import { db, type Database } from "@/db/client";

/**
 * Runs `fn` inside a transaction with `app.tenant_id` set for the session,
 * so Postgres row-level security policies scope every query to this tenant.
 * This is the ONLY sanctioned way to query tenant-scoped tables — app code
 * must never call `db.select()`/`db.insert()` etc. directly on those tables.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: Database) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as Database);
  });
}
