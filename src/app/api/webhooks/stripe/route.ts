import { NextResponse, type NextRequest } from "next/server";
import { eq, and } from "drizzle-orm";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/billing/stripe";
import { withTenant } from "@/lib/tenant/withTenant";
import { subscriptions } from "@/db/schema";

// Per the architecture doc: webhooks (or, in dev mode, the actions in
// src/lib/actions/billing.ts) are the ONLY writer of subscription status —
// nothing in the UI trusts client state for gating.

function mapStripeStatus(status: Stripe.Subscription.Status): "active" | "past_due" | "canceled" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  return "canceled";
}

async function upsertFromSubscription(sub: Stripe.Subscription) {
  const userId = sub.metadata?.userId;
  const tenantId = sub.metadata?.tenantId;
  if (!userId || !tenantId) {
    console.warn("[stripe webhook] subscription event missing userId/tenantId metadata", sub.id);
    return;
  }

  const status = mapStripeStatus(sub.status);
  const currentPeriodEnd = sub.items.data[0]?.current_period_end
    ? new Date(sub.items.data[0].current_period_end * 1000)
    : null;

  await withTenant(tenantId, async (tx) => {
    await tx
      .update(subscriptions)
      .set({
        tier: status === "canceled" ? "free" : "paid",
        status: status === "canceled" ? null : status,
        stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        stripeSubscriptionId: sub.id,
        currentPeriodEnd,
        updatedAt: new Date(),
      })
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.tenantId, tenantId)));
  });
}

export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 501 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const subId =
          typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const sub = await stripe.subscriptions.retrieve(subId);
        await upsertFromSubscription(sub);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await upsertFromSubscription(event.data.object);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
