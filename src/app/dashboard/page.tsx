import { redirect } from "next/navigation";
import Link from "next/link";
import { eq, and, desc, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { withTenant } from "@/lib/tenant/withTenant";
import { userFavoriteCrops, tasks, shoppingListItems, crops, equipmentTypes, plantDiagnoses } from "@/db/schema";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { getUserProfile } from "@/lib/onboarding/profile";
import { plotSizeLabels, expertiseLevelLabels } from "@/lib/onboarding/labels";
import { getSubscription, isPaidTier } from "@/lib/billing/subscription";
import { severityLabels, severityBadgeClasses } from "@/lib/plantHealth/labels";
import { UpgradeBanner } from "@/components/UpgradeBanner";
import { CalendarView } from "@/app/calendar/CalendarView";
import { ThisWeekTasks } from "./ThisWeekTasks";
import { getWeeklyForecast } from "@/lib/weather";
import { weatherCodeLabel, weatherCodeIcon } from "@/lib/weather/labels";
import { EquipmentIcon } from "@/components/icons";
import { FadeIn } from "@/components/FadeIn";

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
    href: "/harvests",
    title: "Harvests",
    description: "Log what you've picked.",
  },
];

function shoppingItemLabel(item: {
  cropName: string | null;
  cropEmoji: string | null;
  equipmentTypeName: string | null;
  freeText: string | null;
}) {
  if (item.cropName) return `${item.cropEmoji ?? ""} ${item.cropName}`.trim();
  if (item.equipmentTypeName) {
    return (
      <span className="inline-flex items-center gap-1">
        <EquipmentIcon className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" />
        {item.equipmentTypeName}
      </span>
    );
  }
  return item.freeText;
}

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

  // Free/no-key API, so shown to every user regardless of tier — unlike the
  // AI-powered features, there's no cost to gate. Runs alongside the DB
  // fetch below rather than after it, since it's an independent network call.
  const forecastPromise =
    profile.latitude != null && profile.longitude != null
      ? getWeeklyForecast(profile.latitude, profile.longitude)
      : Promise.resolve(null);

  const [{ favoriteCount, allTasks, shoppingItems, latestDiagnosis }, weeklyForecast] = await Promise.all([
    withTenant(tenant.id, async (tx) => {
      const [favorites, allTasks, shoppingItems, diagnoses] = await Promise.all([
        tx
          .select({ liked: userFavoriteCrops.liked })
          .from(userFavoriteCrops)
          .where(eq(userFavoriteCrops.userId, session.user.id)),
        tx.select().from(tasks).where(eq(tasks.userId, session.user.id)).orderBy(asc(tasks.dueDate)),
        tx
          .select({ item: shoppingListItems, crop: crops, equipmentType: equipmentTypes })
          .from(shoppingListItems)
          .leftJoin(crops, eq(shoppingListItems.cropId, crops.id))
          .leftJoin(equipmentTypes, eq(shoppingListItems.equipmentTypeId, equipmentTypes.id))
          .where(and(eq(shoppingListItems.userId, session.user.id), eq(shoppingListItems.status, "pending")))
          .orderBy(asc(shoppingListItems.createdAt))
          .limit(6),
        tx
          .select()
          .from(plantDiagnoses)
          .where(eq(plantDiagnoses.userId, session.user.id))
          .orderBy(desc(plantDiagnoses.createdAt))
          .limit(1),
      ]);
      return {
        favoriteCount: favorites.filter((r) => r.liked).length,
        allTasks,
        shoppingItems,
        latestDiagnosis: diagnoses[0] ?? null,
      };
    }),
    forecastPromise,
  ]);
  const weekTasks = allTasks.filter((t) => t.dueDate >= todayStr && t.dueDate <= weekAheadStr);
  const paid = isPaidTier(await getSubscription(session.user.id, tenant.id));

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-(--brand-primary)">
        Welcome, {session.user.email}
      </h1>
      <p className="mt-2 text-sm text-(--text-muted)">Tenant: {tenant.displayName}</p>

      {!paid && (
        <div className="mt-8">
          <UpgradeBanner />
        </div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <FadeIn index={0}>
          <div className="rounded-lg border border-black/10 bg-white p-6 shadow-card">
            <p className="font-display text-lg font-semibold">Weather this week</p>
            <div className="mt-3">
              {!weeklyForecast ? (
                <p className="text-sm text-(--text-muted)">
                  {profile.latitude != null ? "Weather is unavailable right now." : "Add your postcode to see a forecast."}
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
                  {weeklyForecast.map((day, i) => {
                    const WeatherIcon = weatherCodeIcon(day.weatherCode);
                    return (
                      <div key={day.date} className="flex flex-col items-center gap-1 text-center text-xs">
                        <p className="text-(--text-muted)">
                          {i === 0 ? "Today" : new Date(day.date).toLocaleDateString("en-GB", { weekday: "short" })}
                        </p>
                        <span role="img" aria-label={weatherCodeLabel(day.weatherCode)} title={weatherCodeLabel(day.weatherCode)}>
                          <WeatherIcon className="h-8 w-8 text-(--brand-primary)" />
                        </span>
                        <p className="font-medium">{Math.round(day.maxTempC)}°</p>
                        <p className="text-(--text-muted)">{Math.round(day.minTempC)}°</p>
                        {day.precipitationMm >= 1 && (
                          <p className="text-(--text-muted)">💧{Math.round(day.precipitationMm)}mm</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          </FadeIn>

          <FadeIn index={1}>
          <div className="rounded-lg border border-black/10 border-t-4 border-t-(--brand-secondary) bg-white p-6 shadow-card">
            <p className="font-display text-lg font-semibold">This week</p>
            <div className="mt-3">
              <ThisWeekTasks
                tasks={weekTasks.map((t) => ({
                  id: t.id,
                  title: t.title,
                  dueDate: t.dueDate,
                  status: t.status,
                  source: t.source,
                  isIndoor: t.isIndoor,
                  successionSeriesId: t.successionSeriesId,
                }))}
              />
            </div>
          </div>
          </FadeIn>

          <FadeIn index={2}>
          <div className="rounded-lg border border-black/10 bg-white p-6 shadow-card">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-semibold">Shopping list</p>
              <Link href="/shopping-list" className="text-sm text-(--brand-primary) underline">
                View full list →
              </Link>
            </div>
            <div className="mt-3">
              {shoppingItems.length === 0 ? (
                <p className="text-sm text-(--text-muted)">Nothing pending — you&rsquo;re all stocked up.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {shoppingItems.map((r) => (
                    <li key={r.item.id} className="flex items-center justify-between gap-2">
                      <span>{shoppingItemLabel({ cropName: r.crop?.name ?? null, cropEmoji: r.crop?.emoji ?? null, equipmentTypeName: r.equipmentType?.name ?? null, freeText: r.item.freeText })}</span>
                      <span className="text-(--text-muted)">{r.item.quantityLabel}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          </FadeIn>

          <FadeIn index={3}>
          <div className="rounded-lg border border-black/10 bg-white p-6 shadow-card">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-semibold">Plant health</p>
              <Link href="/plant-health" className="text-sm text-(--brand-primary) underline">
                View plant health →
              </Link>
            </div>
            <div className="mt-3 text-sm">
              {!paid ? (
                <p className="text-(--text-muted)">
                  Upload a photo of a struggling plant for an AI diagnosis — membership feature.
                </p>
              ) : !latestDiagnosis ? (
                <p className="text-(--text-muted)">No diagnoses yet — upload a photo to get started.</p>
              ) : latestDiagnosis.status === "pending" ? (
                <p className="text-(--text-muted)">Your plant is being diagnosed…</p>
              ) : latestDiagnosis.status === "failed" ? (
                <p className="text-red-700">Your last diagnosis failed — try again.</p>
              ) : (
                <p>
                  {latestDiagnosis.issue}
                  {latestDiagnosis.severity && (
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs ${severityBadgeClasses[latestDiagnosis.severity]}`}
                    >
                      {severityLabels[latestDiagnosis.severity]}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
          </FadeIn>

          <FadeIn index={4}>
          <div className="rounded-lg border border-black/10 bg-white p-6 shadow-card">
            <div className="flex items-center justify-between">
              <p className="font-display text-lg font-semibold">Calendar</p>
              <Link href="/calendar" className="text-sm text-(--brand-primary) underline">
                Open full calendar →
              </Link>
            </div>
            <div className="mt-3">
              <CalendarView
                initialTasks={allTasks.map((t) => ({
                  id: t.id,
                  title: t.title,
                  notes: t.notes,
                  dueDate: t.dueDate,
                  hardDeadlineDate: t.hardDeadlineDate,
                  status: t.status,
                  source: t.source,
                  isIndoor: t.isIndoor,
                  successionSeriesId: t.successionSeriesId,
                }))}
              />
            </div>
          </div>
          </FadeIn>

          <FadeIn index={5}>
          <div className="rounded-lg border border-black/10 bg-white p-6 shadow-card">
            <p className="font-display text-lg font-semibold">Your garden profile is set up.</p>
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
          </FadeIn>
        </div>

        <div className="flex flex-col gap-3">
          {RESOURCE_LINKS.map((link, i) => (
            <FadeIn key={link.href} index={i + 6}>
              <Link
                href={link.href}
                className="flex items-center justify-between rounded-lg border border-black/10 bg-white p-4 shadow-card hover:border-(--brand-primary)/40 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
              >
                <div>
                  <p className="font-display text-lg font-semibold">{link.title}</p>
                  <p className="mt-1 text-sm text-(--text-muted)">{link.description}</p>
                </div>
              </Link>
            </FadeIn>
          ))}
        </div>
      </div>
    </div>
  );
}
