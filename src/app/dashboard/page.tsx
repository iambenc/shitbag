import { redirect } from "next/navigation";
import { eq, and, desc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/withTenant";
import { shoppingListItems, plantDiagnoses, seedInventory, userEquipment, growPlans, planRecommendations } from "@/db/schema";
import { todayIso } from "@/lib/dates";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { getUserProfile } from "@/lib/onboarding/profile";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { SetupBanner } from "@/components/SetupBanner";
import { FadeIn } from "@/components/FadeIn";
import { getWeeklyForecast, getCurrentWeather } from "@/lib/weather";
import { getMyGardenAreas } from "@/lib/garden/myGarden";
import { getGardenHealthSummary } from "@/lib/garden/health";
import { getDashboardTasks } from "@/lib/dashboard/tasksForDashboard";
import { GreetingHeader } from "./GreetingHeader";
import { CurrentWeatherCard } from "./CurrentWeatherCard";
import { TodayTasksCard } from "./TodayTasksCard";
import { ComingUpCard } from "./ComingUpCard";
import { MyGardenGrid } from "./MyGardenGrid";
import { GardenHealthCard } from "./GardenHealthCard";
import { ResourceCardsRow } from "./ResourceCardsRow";
import { WeeklyForecastStrip } from "./WeeklyForecastStrip";
import { FloatingActionButton } from "./FloatingActionButton";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const today = todayIso();

  // Free/no-key API, so fetched regardless of tier — runs alongside the DB
  // fetch below rather than after it.
  const hasLocation = profile.latitude != null && profile.longitude != null;
  const weatherPromise = hasLocation
    ? Promise.all([
        getWeeklyForecast(profile.latitude!, profile.longitude!),
        getCurrentWeather(profile.latitude!, profile.longitude!),
      ])
    : Promise.resolve([null, null] as const);

  const [
    { hasEquipment, hasSeeds, seedVarietyCount, shoppingItemCount, hasDiagnosis, myGarden, health, dashboardTasks, growPlanStatus, growPlanRecommendationCount },
    [weeklyForecast, currentWeather],
  ] = await Promise.all([
      withTenant(tenant.id, async (tx) => {
        const [equipmentRow, seedRows, shoppingRows, diagnosisRows, myGardenResult, latestPlanRows] = await Promise.all([
          // Existence-only check for SetupBanner — matches how permissive the
          // old onboarding equipment step was.
          tx.select({ id: userEquipment.id }).from(userEquipment).where(eq(userEquipment.userId, session.user.id)).limit(1),
          tx.select({ id: seedInventory.id }).from(seedInventory).where(eq(seedInventory.userId, session.user.id)),
          tx
            .select({ id: shoppingListItems.id })
            .from(shoppingListItems)
            .where(and(eq(shoppingListItems.userId, session.user.id), eq(shoppingListItems.status, "pending"))),
          tx.select({ id: plantDiagnoses.id }).from(plantDiagnoses).where(eq(plantDiagnoses.userId, session.user.id)).limit(1),
          getMyGardenAreas(tx, session.user.id),
          tx
            .select({ id: growPlans.id, status: growPlans.status })
            .from(growPlans)
            .where(eq(growPlans.userId, session.user.id))
            .orderBy(desc(growPlans.createdAt))
            .limit(1),
        ]);

        const latestPlan = latestPlanRows[0] ?? null;
        const activeRecommendationRows =
          latestPlan?.status === "complete"
            ? await tx
                .select({ id: planRecommendations.id })
                .from(planRecommendations)
                .where(
                  and(
                    eq(planRecommendations.growPlanId, latestPlan.id),
                    inArray(planRecommendations.status, ["pending", "accepted", "regenerating"]),
                  ),
                )
            : [];

        const areaLabelByAreaId = new Map(myGardenResult.cards.map((c) => [c.id, c.displayLabel]));
        const [healthSummary, taskSplit] = await Promise.all([
          getGardenHealthSummary(tx, session.user.id),
          getDashboardTasks(
            tx,
            session.user.id,
            today,
            myGardenResult.areaLabelByRecommendationId,
            areaLabelByAreaId,
          ),
        ]);

        return {
          hasEquipment: equipmentRow.length > 0,
          hasSeeds: seedRows.length > 0,
          seedVarietyCount: seedRows.length,
          shoppingItemCount: shoppingRows.length,
          hasDiagnosis: diagnosisRows.length > 0,
          myGarden: myGardenResult.cards,
          health: healthSummary,
          dashboardTasks: taskSplit,
          growPlanStatus: latestPlan?.status ?? null,
          growPlanRecommendationCount: activeRecommendationRows.length,
        };
      }),
      weatherPromise,
    ]);

  const subscription = await getSubscription(session.user.id, tenant.id);
  const paid = isPaidTier(subscription);

  return (
    <div className="relative mx-auto max-w-6xl px-6 py-10">
      <FadeIn index={0}>
        <SetupBanner hasEquipment={hasEquipment} hasSeeds={hasSeeds} />
      </FadeIn>

      {!paid && (
        <FadeIn index={1}>
          <div className={hasEquipment && hasSeeds ? "mt-6" : "mt-4"}>
            <UpgradeBanner />
          </div>
        </FadeIn>
      )}

      <FadeIn index={2}>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <GreetingHeader jobsToday={dashboardTasks.today.length} />
          </div>
          <CurrentWeatherCard current={currentWeather} postcode={profile.postcode} />
        </div>
      </FadeIn>

      <FadeIn index={3}>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TodayTasksCard initialTasks={dashboardTasks.today} />
          </div>
          <ComingUpCard tasks={dashboardTasks.upcoming} />
        </div>
      </FadeIn>

      <FadeIn index={4}>
        <div className="mt-6">
          <MyGardenGrid areas={myGarden} />
        </div>
      </FadeIn>

      <FadeIn index={5}>
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <GardenHealthCard summary={health} />
          <ResourceCardsRow
            seedVarietyCount={seedVarietyCount}
            shoppingItemCount={shoppingItemCount}
            hasDiagnosis={hasDiagnosis}
            paid={paid}
            growPlanStatus={growPlanStatus}
            growPlanRecommendationCount={growPlanRecommendationCount}
          />
        </div>
      </FadeIn>

      <FadeIn index={6}>
        <div className="mt-6">
          <WeeklyForecastStrip weeklyForecast={weeklyForecast} hasPostcode={profile.postcode != null} />
        </div>
      </FadeIn>

      <FloatingActionButton />
    </div>
  );
}
