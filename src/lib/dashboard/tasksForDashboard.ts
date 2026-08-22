import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { tasks, crops } from "@/db/schema";
import type { TaskStatus } from "@/db/schema";

export type DashboardTask = {
  id: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
  cropEmoji: string | null;
  cropName: string | null;
  areaLabel: string | null;
  // Set only for a recurring weekly garden-health-check task — the
  // discriminator TodayTasksCard uses to render "Add photo" instead of
  // "Done". Null for every other task.
  growingAreaId: string | null;
};

export type DashboardTaskSplit = {
  today: DashboardTask[];
  upcoming: DashboardTask[];
};

// Short list, not the full week — "Coming up" is a glance-only preview, the
// full calendar (now a top-level nav item) is where you'd browse further out.
const UPCOMING_LIMIT = 5;

// Splits the dashboard's own task fetch into "today" (due today, including
// missed ones — folded in here rather than hidden, same as CalendarView.tsx
// already shows missed tasks distinctly rather than dropping them) and
// "upcoming" (the next few pending tasks after today). Attaches an area
// label from myGarden.ts's already-computed map rather than re-querying the
// stage/recommendation join.
export async function getDashboardTasks(
  tx: Database,
  userId: string,
  today: string,
  areaLabelByRecommendationId: Map<string, string>,
  areaLabelByAreaId: Map<string, string>,
): Promise<DashboardTaskSplit> {
  const rows = await tx
    .select({
      id: tasks.id,
      title: tasks.title,
      dueDate: tasks.dueDate,
      status: tasks.status,
      planRecommendationId: tasks.planRecommendationId,
      growingAreaId: tasks.growingAreaId,
      cropEmoji: crops.emoji,
      cropName: crops.name,
    })
    .from(tasks)
    .leftJoin(crops, eq(tasks.cropId, crops.id))
    .where(eq(tasks.userId, userId));

  const withArea: DashboardTask[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    dueDate: r.dueDate,
    status: r.status,
    cropEmoji: r.cropEmoji,
    cropName: r.cropName,
    growingAreaId: r.growingAreaId,
    areaLabel: r.planRecommendationId
      ? (areaLabelByRecommendationId.get(r.planRecommendationId) ?? null)
      : r.growingAreaId
        ? (areaLabelByAreaId.get(r.growingAreaId) ?? null)
        : null,
  }));

  const todayTasks = withArea
    .filter((t) => t.dueDate === today && (t.status === "pending" || t.status === "missed"))
    .sort((a, b) => a.title.localeCompare(b.title));

  const upcoming = withArea
    .filter((t) => t.status === "pending" && t.dueDate > today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, UPCOMING_LIMIT);

  return { today: todayTasks, upcoming };
}
