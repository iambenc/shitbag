import "server-only";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { subscriptions } from "@/db/schema";

/**
 * Fetched fresh per request rather than embedded in the session/JWT — a JWT
 * session doesn't refresh mid-session when the DB changes, so a user who
 * just upgraded would keep reading as "free" until their token rotated.
 * Every user gets a subscriptions row at signup, so this should always find
 * one.
 */
export async function getSubscription(userId: string, tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    return row;
  });
}

/** The single gate rule used everywhere: paid tier AND an active Stripe status. */
export function isPaidTier(subscription: { tier: string; status: string | null } | undefined) {
  return subscription?.tier === "paid" && subscription?.status === "active";
}
