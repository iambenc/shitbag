import "server-only";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { subscriptions } from "@/db/schema";
import { isoDate } from "@/lib/dates";

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

/**
 * The date a user's subscription actually lapsed, or null if they're
 * currently paid (nothing has lapsed) or were never paid at all (no
 * currentPeriodEnd to compare against — a genuinely free user, not an
 * expired one). currentPeriodEnd survives a real cancellation (see the
 * Stripe webhook's upsertFromSubscription — tier/status reset to
 * free/null, but currentPeriodEnd keeps the real date their access ended),
 * so this is available even after tier has already flipped back to free.
 * Deliberately doesn't special-case "past_due": a past_due subscription
 * whose currentPeriodEnd is still in the future correctly returns null
 * here (still within their paid-for grace period) purely because the date
 * comparison hasn't tipped yet, without needing to know the exact status.
 */
export function getSubscriptionExpiredAt(
  subscription: { tier: string; status: string | null; currentPeriodEnd: Date | null } | undefined,
): string | null {
  if (isPaidTier(subscription)) return null;
  if (!subscription?.currentPeriodEnd) return null;
  if (subscription.currentPeriodEnd >= new Date()) return null;
  return isoDate(subscription.currentPeriodEnd);
}
