import { redirect } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/withTenant";
import { userFavoriteCrops } from "@/db/schema";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { getUserProfile } from "@/lib/onboarding/profile";
import { plotSizeLabels, expertiseLevelLabels } from "@/lib/onboarding/labels";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const favoriteCount = await withTenant(tenant.id, async (tx) => {
    const rows = await tx
      .select({ liked: userFavoriteCrops.liked })
      .from(userFavoriteCrops)
      .where(eq(userFavoriteCrops.userId, session.user.id));
    return rows.filter((r) => r.liked).length;
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">
        Welcome, {session.user.email}
      </h1>
      <p className="mt-2 text-sm text-[#1f2a1f]/70">Tenant: {tenant.displayName}</p>

      <div className="mt-8 rounded-lg border border-black/10 bg-white p-6">
        <p className="font-medium">Your garden profile is set up.</p>
        <ul className="mt-3 flex flex-col gap-1 text-sm text-[#1f2a1f]/70">
          <li>Plot: {profile.plotSize ? plotSizeLabels[profile.plotSize] : "—"}</li>
          <li>Experience: {profile.expertiseLevel ? expertiseLevelLabels[profile.expertiseLevel] : "—"}</li>
          <li>Favourite crops picked: {favoriteCount}</li>
        </ul>
        <p className="mt-4 text-sm text-[#1f2a1f]/70">
          Task calendar and AI-generated grow recommendations land in a later phase.
        </p>
      </div>

      <Link
        href="/garden"
        className="mt-4 flex items-center justify-between rounded-lg border border-black/10 bg-white p-6 hover:border-(--brand-primary)/40"
      >
        <div>
          <p className="font-medium">Manage your garden layout</p>
          <p className="mt-1 text-sm text-[#1f2a1f]/70">
            Tell us which pots, trays, planters, and beds are set up and ready to grow in.
          </p>
        </div>
        <span aria-hidden className="text-xl text-(--brand-primary)">
          →
        </span>
      </Link>
    </div>
  );
}
