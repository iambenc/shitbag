import { eq } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { tenantPlans } from "@/db/schema";
import { requireTenantAdmin } from "@/lib/actions/shared";
import { PlanForm } from "./PlanForm";

export default async function AdminBillingPage() {
  const { tenantId } = await requireTenantAdmin();

  const plan = await withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(tenantPlans).where(eq(tenantPlans.tenantId, tenantId));
    return row;
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h2 className="font-display text-lg font-semibold">Billing</h2>
      <p className="mt-1 text-sm text-(--text-muted)">
        The membership price gardeners on this tenant are charged.
      </p>
      <div className="mt-8">
        <PlanForm
          plan={{
            monthlyAmount: plan ? (plan.monthlyAmountPence / 100).toFixed(2) : "5.00",
            currency: plan?.currency ?? "gbp",
            trialDays: plan?.trialDays ?? 0,
            stripePriceId: plan?.stripePriceId ?? "",
          }}
        />
      </div>
    </div>
  );
}
