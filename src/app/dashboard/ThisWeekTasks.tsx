"use client";

import { useState } from "react";
import { toggleTaskCompleteAction } from "@/lib/actions/tasks";
import type { TaskStatus, TaskSource } from "@/db/schema";

type Task = {
  id: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
  source: TaskSource;
};

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
    return <p className="text-sm text-[#1f2a1f]/60">Nothing due in the next week.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {taskList.map((task) => (
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
            />
          )}
          <span
            className={
              task.status === "completed"
                ? "line-through text-[#1f2a1f]/50"
                : task.status === "missed"
                  ? "text-red-800"
                  : ""
            }
          >
            {task.title}
          </span>
          {task.source !== "manual" && (
            <span className="rounded-full bg-(--brand-secondary)/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              {task.source}
            </span>
          )}
          <span className="text-xs text-[#1f2a1f]/50">{task.dueDate}</span>
        </li>
      ))}
    </ul>
  );
}
