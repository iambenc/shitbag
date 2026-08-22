import Link from "next/link";
import type { DashboardTask } from "@/lib/dashboard/tasksForDashboard";

function dateChip(dueDate: string): string {
  const d = new Date(`${dueDate}T00:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function ComingUpCard({ tasks }: { tasks: DashboardTask[] }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-black/10 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold">Coming up</p>
        <Link href="/calendar" className="text-sm text-(--brand-primary) underline">
          View calendar →
        </Link>
      </div>

      {tasks.length === 0 ? (
        <p className="mt-4 text-sm text-(--text-muted)">Nothing scheduled yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3">
              <span className="shrink-0 rounded-md bg-(--surface-tint) px-2 py-1 text-center text-[11px] font-medium text-(--text-muted)">
                {dateChip(task.dueDate)}
              </span>
              {task.cropEmoji && (
                <span aria-hidden className="text-lg">
                  {task.cropEmoji}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{task.title}</p>
                {task.areaLabel && <p className="truncate text-xs text-(--text-muted)">{task.areaLabel}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
