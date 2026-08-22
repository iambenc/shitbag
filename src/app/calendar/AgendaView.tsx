"use client";

import { LeafAccent } from "@/components/LeafAccent";
import { TaskCard } from "./TaskCard";
import type { Task } from "./types";

// Reuses the exact same already-fetched/grouped task list as the month
// grid — no separate query — just rendered chronologically instead of in a
// grid, with the same TaskCard used by the selected-day sidebar.
export function AgendaView({
  tasksByDate,
  today,
  onToggle,
  onDelete,
  onCancelSeries,
}: {
  tasksByDate: Map<string, Task[]>;
  today: string;
  onToggle: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onCancelSeries: (successionSeriesId: string) => void;
}) {
  const dates = Array.from(tasksByDate.keys()).sort();

  if (dates.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
        <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
        <p className="text-sm text-(--text-muted)">No tasks yet — add one below.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {dates.map((date) => {
        const dayTasks = (tasksByDate.get(date) ?? []).slice().sort((a, b) => a.title.localeCompare(b.title));
        const label =
          date === today
            ? "Today"
            : new Date(date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
        return (
          <div key={date}>
            <h3 className="text-sm font-medium text-(--text-muted)">{label}</h3>
            <ul className="mt-2 flex flex-col gap-2">
              {dayTasks.map((task) => (
                <TaskCard key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} onCancelSeries={onCancelSeries} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
