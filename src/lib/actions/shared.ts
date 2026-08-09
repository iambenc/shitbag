import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";

/** Every server action needs the same "who is this and which tenant" check. */
export async function requireSessionAndTenant() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  const tenant = await getCurrentTenant();
  return { userId: session.user.id, tenantId: tenant.id };
}

/**
 * Gate for the /admin section — the first role check in the app. Checks both
 * role AND that the session's tenant matches the host-resolved tenant: every
 * other action only relies on one or the other (RLS fails closed on a
 * row-scoped mismatch), but admin actions do INSERT-style config mutations
 * with no existing row's tenant_id to fail closed against, so this is worth
 * being explicit about here. Uses redirect() (not throw) so the same
 * function works from both a Server Component (admin/layout.tsx) and a
 * Server Action (admin.ts).
 */
export async function requireTenantAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const tenant = await getCurrentTenant();
  if (session.user.role !== "tenant_admin" || session.user.tenantId !== tenant.id) {
    redirect("/dashboard");
  }
  return { userId: session.user.id, tenantId: tenant.id };
}
