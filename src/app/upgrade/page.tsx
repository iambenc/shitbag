import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { tenantPlans } from "@/db/schema";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { startCheckoutAction, managePortalAction } from "@/lib/actions/billing";

function formatPrice(pence: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(
    pence / 100,
  );
}

export default async function UpgradePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const [subscription, plan] = await Promise.all([
    getSubscription(session.user.id, tenant.id),
    withTenant(tenant.id, async (tx) => {
      const [row] = await tx.select().from(tenantPlans).where(eq(tenantPlans.tenantId, tenant.id));
      return row;
    }),
  ]);

  const paid = isPaidTier(subscription);
  const price = plan ? formatPrice(plan.monthlyAmountPence, plan.currency) : null;

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">
        {tenant.displayName} membership
      </h1>

      <div className="mt-8 rounded-lg border border-black/10 bg-white p-6">
        {paid ? (
          <>
            <p className="font-medium">You&apos;re subscribed 🌱</p>
            <p className="mt-1 text-sm text-(--text-muted)">
              {subscription?.currentPeriodEnd
                ? `Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString("en-GB")}.`
                : "Your membership is active."}
            </p>
            <form action={managePortalAction} className="mt-4">
              <button
                type="submit"
                className="rounded-full border border-(--brand-primary)/30 px-4 py-2 text-sm hover:bg-(--brand-primary)/10"
              >
                Manage subscription
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="font-medium">
              {price ? `${price}/month` : "Membership"}
            </p>
            <p className="mt-2 text-sm text-(--text-muted)">
              Unlock AI-generated grow plans, weather-aware task adjustments, and personalised
              recommendations for your plot. Everything you already have (calendar, shopping list,
              harvest log, photo journal) stays free either way.
            </p>
            <form action={startCheckoutAction} className="mt-4">
              <button
                type="submit"
                className="rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white hover:opacity-90"
              >
                Subscribe
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
