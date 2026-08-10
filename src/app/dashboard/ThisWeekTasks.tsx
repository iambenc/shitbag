"use client";

import { useState } from "react";
import { toggleTaskCompleteAction } from "@/lib/actions/tasks";
import { LeafAccent } from "@/components/LeafAccent";
import type { TaskStatus, TaskSource } from "@/db/schema";

type Task = {
  id: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
  source: TaskSource;
  isIndoor: boolean;
  successionSeriesId: string | null;
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function isoDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dateLabel(dueDate: string, todayStr: string, tomorrowStr: string) {
  if (dueDate === todayStr) return "Today";
  if (dueDate === tomorrowStr) return "Tomorrow";
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

export function ThisWeekTasks({ tasks }: { tasks: Task[] }) {
  const [taskList, setTaskList] = useState(tasks);

  async function handleToggle(task: Task) {
    const completed = task.status !== "completed";
    setTaskList((ts) =>
      ts.map((t) => (t.id === task.id ? { ...t, status: completed ? "completed" : "pending" } : t)),
    );
    await toggleTaskCompleteAction(task.id, completed);
  }

  if (taskList.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
        <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
        <p className="text-sm text-(--text-muted)">Nothing due in the next week.</p>
      </div>
    );
  }

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayStr = isoDate(today);
  const tomorrowStr = isoDate(tomorrow);

  // taskList is already ordered by dueDate (server query), and Map preserves
  // insertion order, so the groups come out in date order for free.
  const groups = new Map<string, Task[]>();
  for (const task of taskList) {
    const group = groups.get(task.dueDate);
    if (group) group.push(task);
    else groups.set(task.dueDate, [task]);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...groups.entries()].map(([dueDate, dayTasks]) => (
        <div key={dueDate}>
          <p className="text-xs font-medium text-(--text-muted)">
            {dateLabel(dueDate, todayStr, tomorrowStr)}
          </p>
          <ul className="mt-1 flex flex-col gap-2">
            {dayTasks.map((task) => (
              <li key={task.id} className="flex items-center gap-2 text-sm">
                {task.status === "missed" ? (
                  <span className="text-red-700" aria-hidden>
                    ⚠
                  </span>
                ) : (
                  <input
                    type="checkbox"
                    checked={task.status === "completed"}
                    onChange={() => handleToggle(task)}
                    className="accent-(--brand-primary)"
                  />
                )}
                <span
                  className={
                    task.status === "completed"
                      ? "line-through text-(--text-muted)"
                      : task.status === "missed"
                        ? "text-red-800"
                        : ""
                  }
                >
                  {task.title}
                </span>
                {task.source === "weather" && (
                  <span className="rounded-full bg-(--brand-secondary)/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    weather
                  </span>
                )}
                {task.isIndoor && (
                  <span
                    className="rounded-full bg-(--brand-primary)/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-(--brand-primary)"
                    title="Sow or start this one indoors"
                  >
                    Indoor
                  </span>
                )}
                {task.successionSeriesId && (
                  <span
                    className="rounded-full bg-(--brand-primary)/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-(--brand-primary)"
                    title="One of several staggered sowings of this crop, for a continuous harvest"
                  >
                    Succession
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
