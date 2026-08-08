"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { subscriptions, tenantPlans } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { getStripeClient } from "@/lib/billing/stripe";
import { getRequestOrigin } from "@/lib/http/origin";

export async function startCheckoutAction(): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  const stripe = getStripeClient();

  const plan = await withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(tenantPlans).where(eq(tenantPlans.tenantId, tenantId));
    return row;
  });

  if (stripe && plan?.stripePriceId) {
    const origin = await getRequestOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${origin}/upgrade?checkout=success`,
      cancel_url: `${origin}/upgrade?checkout=cancelled`,
      client_reference_id: userId,
      metadata: { userId, tenantId },
      // The webhook only ever sees the Subscription object on later events
      // (renewals, cancellations) — it needs its own copy of this metadata,
      // not just the Checkout Session's.
      subscription_data: { metadata: { userId, tenantId } },
    });
    if (session.url) redirect(session.url);
    return;
  }

  // Dev mode: no Stripe key, or the tenant's plan has no Stripe price configured yet.
  console.log(`[dev-mode] simulating checkout for user ${userId}`);
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 30);
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(subscriptions)
      .set({ tier: "paid", status: "active", currentPeriodEnd: periodEnd, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId));
  });
  // The header nav (rendered by the root layout, shared across every route)
  // reads subscription tier too — without this, Next's client-side Router
  // Cache keeps serving the pre-mutation layout output after the redirect.
  revalidatePath("/", "layout");
  redirect("/upgrade");
}

export async function managePortalAction(): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  const stripe = getStripeClient();

  const sub = await withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    return row;
  });

  if (stripe && sub?.stripeCustomerId) {
    const origin = await getRequestOrigin();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${origin}/upgrade`,
    });
    redirect(portalSession.url);
  }

  // Dev mode: no Stripe customer on file — simulate cancelling back to free.
  console.log(`[dev-mode] simulating cancellation for user ${userId}`);
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(subscriptions)
      .set({ tier: "free", status: null, currentPeriodEnd: null, updatedAt: new Date() })
      .where(eq(subscriptions.userId, userId));
  });
  revalidatePath("/", "layout");
  redirect("/upgrade");
}
