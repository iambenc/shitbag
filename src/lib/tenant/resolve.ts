import "server-only";
import { headers } from "next/headers";
import { eq, or } from "drizzle-orm";
import { db } from "@/db/client";
import { tenants } from "@/db/schema";

export const PLATFORM_TENANT_SLUG = "edurnity";

export type CurrentTenant = typeof tenants.$inferSelect;

/**
 * Looks up the Tenant row for the current request using the slug/domain hint
 * proxy.ts attached to the headers. Uses the unscoped `db` (not
 * `withTenant`) because resolving the tenant is what tells us what to scope
 * by in the first place. Falls back to the platform tenant when there's no
 * subdomain/custom-domain match (bare root domain, e.g. local dev).
 */
export async function getCurrentTenant(): Promise<CurrentTenant> {
  const headerList = await headers();
  const slug = headerList.get("x-tenant-slug");
  const domain = headerList.get("x-tenant-domain");

  const conditions = [eq(tenants.slug, PLATFORM_TENANT_SLUG)];
  if (slug) conditions.push(eq(tenants.slug, slug));
  if (domain) conditions.push(eq(tenants.customDomain, domain));

  const candidates = await db
    .select()
    .from(tenants)
    .where(or(...conditions));

  const bySlug = slug && candidates.find((t) => t.slug === slug);
  const byDomain = domain && candidates.find((t) => t.customDomain === domain);
  const platform = candidates.find((t) => t.slug === PLATFORM_TENANT_SLUG);

  const tenant = bySlug || byDomain || platform;
  if (!tenant) {
    throw new Error(
      `No tenant resolved for slug="${slug}" domain="${domain}" and no platform tenant seeded. Run 'pnpm db:seed'.`,
    );
  }
  return tenant;
}
