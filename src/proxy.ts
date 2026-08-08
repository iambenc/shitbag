import { NextResponse, type NextRequest } from "next/server";

/**
 * Resolves which tenant a request belongs to, purely from the Host header —
 * no DB access here (middleware may run on the Edge runtime, which can't
 * open a TCP connection to Postgres). The actual Tenant row lookup happens
 * downstream (layout/auth, both Node.js runtime) using the slug/domain this
 * sets on `x-tenant-slug` / `x-tenant-domain`.
 *
 * Resolution rules, in order:
 *  - `<slug>.localhost[:port]`      -> local dev subdomain
 *  - `<slug>.edurnity.app`          -> production subdomain
 *  - anything else (custom domain)  -> forwarded as x-tenant-domain, resolved
 *                                      against tenants.customDomain downstream
 *  - bare root domain / localhost   -> no slug/domain set, downstream falls
 *                                      back to the platform tenant ("edurnity")
 */
const PLATFORM_ROOT_DOMAINS = ["edurnity.app", "localhost"];

function resolveTenantHint(host: string): { slug?: string; domain?: string } {
  const hostname = host.split(":")[0];

  for (const root of PLATFORM_ROOT_DOMAINS) {
    if (hostname === root) return {};
    if (hostname.endsWith(`.${root}`)) {
      const slug = hostname.slice(0, -(root.length + 1));
      return slug ? { slug } : {};
    }
  }

  return { domain: hostname };
}

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { slug, domain } = resolveTenantHint(host);

  const headers = new Headers(request.headers);
  if (slug) headers.set("x-tenant-slug", slug);
  if (domain) headers.set("x-tenant-domain", domain);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
