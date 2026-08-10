import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { planRecommendations, growPlans } from "@/db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const tenant = await getCurrentTenant();

  // No direct userId on planRecommendations — ownership is only reachable
  // via growPlanId -> growPlans.userId, same join pattern used everywhere
  // else this table needs a userId check.
  const row = await withTenant(tenant.id, async (tx) => {
    const [r] = await tx
      .select({ status: planRecommendations.status, userId: growPlans.userId })
      .from(planRecommendations)
      .innerJoin(growPlans, eq(planRecommendations.growPlanId, growPlans.id))
      .where(eq(planRecommendations.id, id));
    return r;
  });

  if (!row || row.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ status: row.status });
}
