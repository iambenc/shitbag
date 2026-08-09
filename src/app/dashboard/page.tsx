import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/withTenant";
import { userFavoriteCrops, tasks } from "@/db/schema";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { getUserProfile } from "@/lib/onboarding/profile";
import { plotSizeLabels, expertiseLevelLabels } from "@/lib/onboarding/labels";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { ThisWeekTasks } from "./ThisWeekTasks";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const RESOURCE_LINKS = [
  {
    href: "/grow-plan",
    title: "AI Grow Plan",
    description: "A plan tailored to your plot, seeds, and experience — membership feature.",
  },
  {
    href: "/favourites",
    title: "Favourite crops",
    description: "Update what fruit and veg you're most excited to grow.",
  },
  {
    href: "/garden",
    title: "Manage your garden layout",
    description: "Tell us which pots, trays, planters, and beds are set up and ready to grow in.",
  },
  {
    href: "/calendar",
    title: "Calendar",
    description: "Add and track tasks by date.",
  },
  {
    href: "/shopping-list",
    title: "Shopping list",
    description: "Seeds and supplies to pick up.",
  },
  {
    href: "/harvests",
    title: "Harvests",
    description: "Log what you've picked.",
  },
  {
    href: "/journal",
    title: "Photo journal",
    description: "Keep a visual record, and share what you like.",
  },
  {
    href: "/plant-health",
    title: "Plant Health",
    description: "Upload a photo for an AI diagnosis — membership feature.",
  },
];

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const today = new Date();
  const weekAhead = new Date(today);
  weekAhead.setDate(weekAhead.getDate() + 6);
  const todayStr = isoDate(today);
  const weekAheadStr = isoDate(weekAhead);

  const [favoriteCount, weekTasks] = await withTenant(tenant.id, async (tx) => {
    const [favorites, weekTasks] = await Promise.all([
      tx
        .select({ liked: userFavoriteCrops.liked })
        .from(userFavoriteCrops)
        .where(eq(userFavoriteCrops.userId, session.user.id)),
      tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, session.user.id),
            gte(tasks.dueDate, todayStr),
            lte(tasks.dueDate, weekAheadStr),
          ),
        )
        .orderBy(asc(tasks.dueDate)),
    ]);
    return [favorites.filter((r) => r.liked).length, weekTasks];
  });
  const paid = isPaidTier(await getSubscription(session.user.id, tenant.id));

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-(--brand-primary)">
        Welcome, {session.user.email}
      </h1>
      <p className="mt-2 text-sm text-(--text-muted)">Tenant: {tenant.displayName}</p>

      {!paid && (
        <div className="mt-6">
          <UpgradeBanner />
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-lg border border-black/10 bg-white p-6">
            <p className="font-medium">This week</p>
            <div className="mt-3">
              <ThisWeekTasks
                tasks={weekTasks.map((t) => ({
                  id: t.id,
                  title: t.title,
                  dueDate: t.dueDate,
                  status: t.status,
                  source: t.source,
                }))}
              />
            </div>
          </div>

          <div className="rounded-lg border border-black/10 bg-white p-6">
            <p className="font-medium">Your garden profile is set up.</p>
            <ul className="mt-3 flex flex-col gap-1 text-sm text-(--text-muted)">
              <li>Plot: {profile.plotSize ? plotSizeLabels[profile.plotSize] : "—"}</li>
              <li>Experience: {profile.expertiseLevel ? expertiseLevelLabels[profile.expertiseLevel] : "—"}</li>
              <li>
                Favourite crops picked: {favoriteCount}{" "}
                <Link href="/favourites" className="text-(--brand-primary) underline">
                  edit
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {RESOURCE_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center justify-between rounded-lg border border-black/10 bg-white p-4 hover:border-(--brand-primary)/40"
            >
              <div>
                <p className="font-medium">{link.title}</p>
                <p className="mt-1 text-sm text-(--text-muted)">{link.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
