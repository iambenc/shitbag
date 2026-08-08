"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { withTenant } from "@/lib/tenant/withTenant";
import { growPlans } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { inngest } from "@/inngest/client";

export async function generateGrowPlanAction(): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();

  const subscription = await getSubscription(userId, tenantId);
  if (!isPaidTier(subscription)) {
    redirect("/upgrade");
  }

  const growPlan = await withTenant(tenantId, async (tx) => {
    const [row] = await tx.insert(growPlans).values({ tenantId, userId, status: "pending" }).returning();
    return row;
  });

  await inngest.send({
    name: "grow-plan/requested",
    data: { growPlanId: growPlan.id, tenantId, userId },
  });

  revalidatePath("/", "layout");
  redirect("/grow-plan");
}
