import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/withTenant";
import { userProfiles } from "@/db/schema";
import { getCurrentTenant } from "@/lib/tenant/resolve";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await withTenant(tenant.id, async (tx) => {
    const [row] = await tx
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, session.user.id));
    return row;
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">
        Welcome, {session.user.email}
      </h1>
      <p className="mt-2 text-sm text-[#1f2a1f]/70">Tenant: {tenant.displayName}</p>

      <div className="mt-8 rounded-lg border border-black/10 bg-white p-6">
        {profile?.onboardingCompletedAt ? (
          <p>Your garden plan is set up. Task calendar and recommendations land in a later phase.</p>
        ) : (
          <>
            <p className="font-medium">Your garden profile isn&apos;t set up yet.</p>
            <p className="mt-1 text-sm text-[#1f2a1f]/70">
              The onboarding flow (location, plot size, equipment, favourite crops) is next up —
              this dashboard shell just confirms auth + tenant scoping are wired correctly.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
