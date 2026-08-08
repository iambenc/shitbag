import { sql, type SQL } from "drizzle-orm";
import { pgPolicy, type PgColumn } from "drizzle-orm/pg-core";

/** The tenant id set per-request by `withTenant()` via `SET LOCAL app.tenant_id`. */
export const currentTenantId: SQL = sql`current_setting('app.tenant_id', true)::uuid`;

/**
 * Standard row-level-security policy for a tenant-scoped table: rows are only
 * visible/writable when their tenant_id matches the session's app.tenant_id.
 * Apply to every table that carries a tenantId column, via the table's
 * extraConfig array, and call `.enableRLS()` on the table itself.
 */
export function tenantIsolationPolicy(tableName: string, tenantIdColumn: PgColumn) {
  return pgPolicy(`${tableName}_tenant_isolation`, {
    for: "all",
    using: sql`${tenantIdColumn} = ${currentTenantId}`,
    withCheck: sql`${tenantIdColumn} = ${currentTenantId}`,
  });
}
