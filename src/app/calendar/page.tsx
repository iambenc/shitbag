import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { tasks, seedInventory } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { resolveSeedStock, type SeedStockRow } from "@/lib/seeds/stock";
import { todayIso } from "@/lib/dates";
import { getSubscription, getSubscriptionExpiredAt } from "@/lib/billing/subscription";
import { CalendarView } from "./CalendarView";

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const [userTasks, seedRows] = await withTenant(tenant.id, async (tx) =>
    Promise.all([
      tx.select().from(tasks).where(eq(tasks.userId, session.user.id)).orderBy(asc(tasks.dueDate)),
      tx
        .select({ cropId: seedInventory.cropId, varietyId: seedInventory.varietyId, seedCount: seedInventory.seedCount })
        .from(seedInventory)
        .where(eq(seedInventory.userId, session.user.id)),
    ]),
  );

  // Batched once for the whole page (not per-task) — grouped by cropId so
  // resolveSeedStock's variety-vs-agnostic bucket logic can run in memory,
  // matching the same tri-state semantics the daily push-back job uses, so
  // the badge can never show a task as blocked that the job wouldn't
  // actually push back (or vice versa).
  const seedRowsByCrop = new Map<string, SeedStockRow[]>();
  for (const row of seedRows) {
    const list = seedRowsByCrop.get(row.cropId) ?? [];
    list.push({ varietyId: row.varietyId, seedCount: row.seedCount });
    seedRowsByCrop.set(row.cropId, list);
  }
  const today = todayIso();
  function isSeedBlocked(t: (typeof userTasks)[number]): boolean {
    if (t.status !== "pending" || !t.cropId || !t.estimatedSeedsUsed || t.dueDate > today) return false;
    const stock = resolveSeedStock(seedRowsByCrop.get(t.cropId) ?? [], t.varietyId);
    return stock.known && stock.total < t.estimatedSeedsUsed;
  }

  // Tasks are never deleted when a subscription lapses — just visually
  // blurred once their due date falls past the date access actually ended,
  // so a returning subscriber sees everything picked back up exactly where
  // it left off.
  const subscription = await getSubscription(session.user.id, tenant.id);
  const subscriptionExpiredAt = getSubscriptionExpiredAt(subscription);
  function isBlurred(t: (typeof userTasks)[number]): boolean {
    return subscriptionExpiredAt !== null && t.dueDate > subscriptionExpiredAt;
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">Calendar</h1>
      <p className="mt-2 text-sm text-(--text-muted)">Keep track of what needs doing, and when.</p>
      <div className="mt-8">
        <CalendarView
          initialTasks={userTasks.map((t) => ({
            id: t.id,
            title: t.title,
            notes: t.notes,
            dueDate: t.dueDate,
            hardDeadlineDate: t.hardDeadlineDate,
            status: t.status,
            source: t.source,
            isIndoor: t.isIndoor,
            successionSeriesId: t.successionSeriesId,
            seedBlocked: isSeedBlocked(t),
            blurred: isBlurred(t),
          }))}
        />
      </div>
    </div>
  );
}
