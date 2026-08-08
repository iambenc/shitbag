import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { plantDiagnoses } from "@/db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const tenant = await getCurrentTenant();

  const diagnosis = await withTenant(tenant.id, async (tx) => {
    const [row] = await tx
      .select({ status: plantDiagnoses.status, userId: plantDiagnoses.userId })
      .from(plantDiagnoses)
      .where(eq(plantDiagnoses.id, id));
    return row;
  });

  if (!diagnosis || diagnosis.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ status: diagnosis.status });
}
