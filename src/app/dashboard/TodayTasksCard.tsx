"use client";

import { useState } from "react";
import Link from "next/link";
import { toggleTaskCompleteAction } from "@/lib/actions/tasks";
import { CheckIcon, WarningIcon } from "@/components/icons";
import type { DashboardTask } from "@/lib/dashboard/tasksForDashboard";

// Fully client, fed server data once — same shape as CalendarView.tsx (this
// codebase's established pattern for a task list with an optimistic
// complete-toggle), rather than a server component + separate client island.
// Most tasks get a plain "Done" toggle (reusing toggleTaskCompleteAction
// directly); a recurring garden-health-check task (growingAreaId set)
// instead links to the photo-upload flow that completes it — see the render
// below.
export function TodayTasksCard({ initialTasks }: { initialTasks: DashboardTask[] }) {
  // Adjusting state during render when the prop identity changes (same
  // pattern GrowingAreaManager.tsx already uses), not useEffect — needed
  // because router.refresh() (e.g. after FloatingActionButton's quick-add
  // task) re-renders this component with a fresh `initialTasks` prop, and a
  // plain useState(initialTasks) would otherwise keep showing the stale
  // list forever (useState's initial value is only read on mount).
  const [prevInitialTasks, setPrevInitialTasks] = useState(initialTasks);
  const [taskList, setTaskList] = useState(initialTasks);
  if (initialTasks !== prevInitialTasks) {
    setPrevInitialTasks(initialTasks);
    setTaskList(initialTasks);
  }

  async function handleDone(task: DashboardTask) {
    setTaskList((ts) => ts.filter((t) => t.id !== task.id));
    await toggleTaskCompleteAction(task.id, true);
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-black/10 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold">Today&rsquo;s garden tasks</p>
        <span className="rounded-full bg-(--brand-primary)/10 px-2.5 py-0.5 text-xs font-medium text-(--brand-primary)">
          {taskList.length} task{taskList.length === 1 ? "" : "s"}
        </span>
      </div>

      {taskList.length === 0 ? (
        <p className="mt-4 text-sm text-(--text-muted)">Nothing due today — nice work.</p>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-black/5">
          {taskList.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                {task.status === "missed" && (
                  <WarningIcon className="h-4 w-4 shrink-0 text-(--color-terracotta)" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  {task.areaLabel && <p className="truncate text-xs text-(--text-muted)">{task.areaLabel}</p>}
                </div>
              </div>
              {task.growingAreaId ? (
                // A recurring weekly garden-health-check task — its job is
                // "take a photo of this area," not a plain checkbox, so it
                // links to the existing plant-health upload+diagnose page
                // pre-scoped to this area/task rather than completing here.
                // uploadAndDiagnoseAction marks the task done itself once
                // the photo is accepted.
                <Link
                  href={`/plant-health?growingAreaId=${task.growingAreaId}&taskId=${task.id}`}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-(--brand-primary)/30 px-3 py-1 text-xs font-medium text-(--brand-primary) transition hover:bg-(--brand-primary)/10 active:scale-95"
                >
                  Add photo →
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => handleDone(task)}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-(--brand-primary)/30 px-3 py-1 text-xs font-medium text-(--brand-primary) transition hover:bg-(--brand-primary)/10 active:scale-95"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                  Done
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Link href="/calendar" className="mt-3 text-sm text-(--brand-primary) underline">
        Open full calendar →
      </Link>
    </div>
  );
}
