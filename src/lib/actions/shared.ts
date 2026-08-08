import "server-only";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";

/** Every server action needs the same "who is this and which tenant" check. */
export async function requireSessionAndTenant() {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  const tenant = await getCurrentTenant();
  return { userId: session.user.id, tenantId: tenant.id };
}
