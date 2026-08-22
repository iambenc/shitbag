import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { tasks, seedInventory, crops, harvestLog } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { resolveSeedStock, type SeedStockRow } from "@/lib/seeds/stock";
import { todayIso } from "@/lib/dates";
import { getSubscription, getSubscriptionExpiredAt } from "@/lib/billing/subscription";
import { getMyGardenAreas } from "@/lib/garden/myGarden";
import { GROWING_AREA_ILLUSTRATION_SRC } from "@/lib/garden/illustrations";
import { getWeeklyForecast, getCurrentWeather } from "@/lib/weather";
import { getTaskCategory } from "@/lib/calendar/taskCategory";
import { CalendarView } from "./CalendarView";

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const [taskRows, seedRows, myGarden, harvestRows] = await withTenant(tenant.id, async (tx) =>
    Promise.all([
      tx
        .select({ task: tasks, cropEmoji: crops.emoji, cropName: crops.name })
        .from(tasks)
        .leftJoin(crops, eq(tasks.cropId, crops.id))
        .where(eq(tasks.userId, session.user.id))
        .orderBy(asc(tasks.dueDate)),
      tx
        .select({ cropId: seedInventory.cropId, varietyId: seedInventory.varietyId, seedCount: seedInventory.seedCount })
        .from(seedInventory)
        .where(eq(seedInventory.userId, session.user.id)),
      getMyGardenAreas(tx, session.user.id),
      // Every logged harvest's date, for the month grid's carrot marker —
      // this app has never generated a "you should harvest this" task type
      // (grow-plan tasks are sow/feed/transplant only), so real harvestLog
      // history is what backs that marker instead of a fabricated task kind.
      tx.select({ harvestedAt: harvestLog.harvestedAt }).from(harvestLog).where(eq(harvestLog.userId, session.user.id)),
    ]),
  );

  const areaLabelByAreaId = new Map(myGarden.cards.map((c) => [c.id, c.displayLabel]));
  const areaTypeByAreaId = new Map(myGarden.cards.map((c) => [c.id, c.type]));

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
  function isSeedBlocked(t: (typeof taskRows)[number]["task"]): boolean {
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
  function isBlurred(t: (typeof taskRows)[number]["task"]): boolean {
    return subscriptionExpiredAt !== null && t.dueDate > subscriptionExpiredAt;
  }

  // Free/no-key API, so fetched regardless of tier — the month grid can
  // only ever show REAL weather (today + the next ~6 real forecast days,
  // whatever getWeeklyForecast actually returns), never an invented value
  // for the rest of the month.
  const hasLocation = profile.latitude != null && profile.longitude != null;
  const [weeklyForecast, currentWeather] = hasLocation
    ? await Promise.all([getWeeklyForecast(profile.latitude!, profile.longitude!), getCurrentWeather(profile.latitude!, profile.longitude!)])
    : [null, null];

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="flex items-center gap-2 font-display text-3xl font-semibold text-(--brand-primary)">
        Calendar <span aria-hidden>🌱</span>
      </h1>
      <p className="mt-2 text-sm text-(--text-muted)">Keep track of what needs doing, and when.</p>
      <div className="mt-8">
        <CalendarView
          initialTasks={taskRows.map(({ task: t, cropEmoji, cropName }) => ({
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
            category: getTaskCategory({
              title: t.title,
              source: t.source,
              growingAreaId: t.growingAreaId,
              estimatedSeedsUsed: t.estimatedSeedsUsed,
              activatesStageId: t.activatesStageId,
            }),
            cropEmoji,
            cropName,
            growingAreaId: t.growingAreaId,
            areaLabel: t.planRecommendationId
              ? (myGarden.areaLabelByRecommendationId.get(t.planRecommendationId) ?? null)
              : t.growingAreaId
                ? (areaLabelByAreaId.get(t.growingAreaId) ?? null)
                : null,
            // Growing-area illustrations exist per area *type* (bed/pot/etc.),
            // not per task — only health-check tasks carry a growingAreaId at
            // all, and every one of them is guaranteed to resolve here since
            // generateHealthCheckTasks.ts only creates them for areas the
            // user actually owns.
            illustrationSrc: (() => {
              const areaType = t.growingAreaId ? areaTypeByAreaId.get(t.growingAreaId) : undefined;
              return areaType ? (GROWING_AREA_ILLUSTRATION_SRC[areaType] ?? null) : null;
            })(),
          }))}
          initialHarvestDates={harvestRows.map((r) => r.harvestedAt)}
          weeklyForecast={weeklyForecast}
          currentWeather={currentWeather}
          postcode={profile.postcode}
        />
      </div>
    </div>
  );
}
