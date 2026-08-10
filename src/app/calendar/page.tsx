import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant/resolve";
import { withTenant } from "@/lib/tenant/withTenant";
import { tasks } from "@/db/schema";
import { getUserProfile } from "@/lib/onboarding/profile";
import { CalendarView } from "./CalendarView";

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const tenant = await getCurrentTenant();
  const profile = await getUserProfile(session.user.id, tenant.id);
  if (!profile?.onboardingCompletedAt) redirect("/onboarding/location");

  const userTasks = await withTenant(tenant.id, async (tx) =>
    tx.select().from(tasks).where(eq(tasks.userId, session.user.id)).orderBy(asc(tasks.dueDate)),
  );

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
          }))}
        />
      </div>
    </div>
  );
}
