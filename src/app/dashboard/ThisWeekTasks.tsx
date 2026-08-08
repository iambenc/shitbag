"use client";

import { useState } from "react";
import { toggleTaskCompleteAction } from "@/lib/actions/tasks";

type Task = { id: string; title: string; dueDate: string; status: "pending" | "completed" };

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
          <input
            type="checkbox"
            checked={task.status === "completed"}
            onChange={() => handleToggle(task)}
          />
          <span className={task.status === "completed" ? "line-through text-[#1f2a1f]/50" : ""}>
            {task.title}
          </span>
          <span className="text-xs text-[#1f2a1f]/50">{task.dueDate}</span>
        </li>
      ))}
    </ul>
  );
}
