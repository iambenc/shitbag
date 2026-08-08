import "server-only";
import { headers } from "next/headers";

/**
 * Absolute origin for the current request, derived from headers rather than
 * a fixed env var — each tenant is on its own subdomain/custom domain, so a
 * single hardcoded base URL wouldn't return Stripe redirects to the right
 * tenant.
 */
export async function getRequestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
