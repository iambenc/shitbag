"use client";

import { useActionState, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  createTaskAction,
  toggleTaskCompleteAction,
  deleteTaskAction,
  cancelSuccessionSeriesAction,
  type CreateTaskState,
} from "@/lib/actions/tasks";
import { LeafAccent } from "@/components/LeafAccent";
import { ChevronLeftIcon, ChevronRightIcon, WarningIcon } from "@/components/icons";
import type { TaskStatus, TaskSource } from "@/db/schema";

type Task = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string;
  hardDeadlineDate: string | null;
  status: TaskStatus;
  source: TaskSource;
  isIndoor: boolean;
  successionSeriesId: string | null;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function isoDate(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}
function todayIso() {
  const d = new Date();
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

const initialCreateState: CreateTaskState = {};

export function CalendarView({ initialTasks }: { initialTasks: Task[] }) {
  const [taskList, setTaskList] = useState(initialTasks);
  const today = todayIso();
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewYear, setViewYear] = useState(Number(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(Number(today.slice(5, 7)) - 1);

  const [createState, createFormAction] = useActionState(
    async (prev: CreateTaskState, formData: FormData) => {
      const result = await createTaskAction(prev, formData);
      if (result.task) {
        setTaskList((ts) => [...ts, result.task!]);
      }
      return result;
    },
    initialCreateState,
  );

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of taskList) {
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    return map;
  }, [taskList]);

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function changeMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  }

  async function handleToggle(task: Task) {
    const completed = task.status !== "completed";
    setTaskList((ts) =>
      ts.map((t) => (t.id === task.id ? { ...t, status: completed ? "completed" : "pending" } : t)),
    );
    await toggleTaskCompleteAction(task.id, completed);
  }

  async function handleDelete(taskId: string) {
    setTaskList((ts) => ts.filter((t) => t.id !== taskId));
    await deleteTaskAction(taskId);
  }

  async function handleCancelSeries(successionSeriesId: string) {
    if (!window.confirm("Cancel the remaining re-sows for this crop? Already-completed ones are unaffected.")) {
      return;
    }
    setTaskList((ts) =>
      ts.filter((t) => !(t.successionSeriesId === successionSeriesId && t.status === "pending")),
    );
    await cancelSuccessionSeriesAction(successionSeriesId);
  }

  const selectedTasks = (tasksByDate.get(selectedDate) ?? []).slice().sort((a, b) =>
    a.title.localeCompare(b.title),
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="rounded-full border border-black/15 p-1.5 hover:bg-black/5"
            aria-label="Previous month"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <p className="font-medium">
            {MONTH_LABELS[viewMonth]} {viewYear}
          </p>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="rounded-full border border-black/15 p-1.5 hover:bg-black/5"
            aria-label="Next month"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-(--text-muted)">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`blank-${i}`} />;
            const date = isoDate(viewYear, viewMonth, day);
            const count = tasksByDate.get(date)?.length ?? 0;
            const isSelected = date === selectedDate;
            const isToday = date === today;
            return (
              <button
                type="button"
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-md text-sm ${
                  isSelected
                    ? "text-white"
                    : isToday
                      ? "border border-(--brand-primary) text-(--brand-primary)"
                      : "hover:bg-black/5"
                }`}
              >
                {isSelected && (
                  <motion.div
                    layoutId="calendar-day-highlight"
                    className="absolute inset-0 bg-(--brand-primary)"
                    transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                  />
                )}
                <span className="relative">{day}</span>
                {count > 0 && (
                  <span
                    className={`relative mt-0.5 h-2 w-2 rounded-full ${isSelected ? "bg-white" : "bg-(--brand-primary)"}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <section>
        <h2 className="text-sm font-medium text-(--text-muted)">Tasks for {selectedDate}</h2>
        {selectedTasks.length === 0 ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
            <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
            <p className="text-sm text-(--text-muted)">Nothing due this day.</p>
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {selectedTasks.map((task) => (
              <li
                key={task.id}
                className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                  task.status === "missed" ? "border-red-200 bg-red-50" : "border-black/10 bg-white"
                }`}
              >
                <label className="flex flex-1 items-start gap-2 text-sm">
                  {task.status === "missed" ? (
                    <WarningIcon className="mt-1 h-4 w-4 shrink-0 text-red-700" />
                  ) : (
                    <input
                      type="checkbox"
                      checked={task.status === "completed"}
                      onChange={() => handleToggle(task)}
                      className="mt-1 accent-(--brand-primary)"
                    />
                  )}
                  <span>
                    <span
                      className={`transition-colors duration-300 ${
                        task.status === "completed"
                          ? "line-through text-(--text-muted)"
                          : task.status === "missed"
                            ? "text-red-800"
                            : ""
                      }`}
                    >
                      {task.title}
                    </span>
                    {task.source !== "manual" && (
                      <span className="ml-2 rounded-full bg-(--brand-secondary)/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                        {task.source}
                      </span>
                    )}
                    {task.isIndoor && (
                      <span
                        className="ml-2 rounded-full bg-(--brand-primary)/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-(--brand-primary)"
                        title="Sow or start this one indoors"
                      >
                        Indoor
                      </span>
                    )}
                    {task.successionSeriesId && (
                      <span
                        className="ml-2 rounded-full bg-(--brand-primary)/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-(--brand-primary)"
                        title="One of several staggered sowings of this crop, for a continuous harvest"
                      >
                        Succession
                      </span>
                    )}
                    {task.status === "missed" && (
                      <span className="ml-2 rounded-full bg-red-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-800">
                        Missed
                      </span>
                    )}
                    {task.notes && <p className="text-xs text-(--text-muted)">{task.notes}</p>}
                    {task.hardDeadlineDate && (
                      <p className="text-xs text-(--text-muted)">Last date: {task.hardDeadlineDate}</p>
                    )}
                  </span>
                </label>
                <div className="flex flex-col items-end gap-1">
                  {task.successionSeriesId && task.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => handleCancelSeries(task.successionSeriesId!)}
                      className="text-xs text-(--text-muted) hover:text-red-700"
                    >
                      Cancel remaining
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(task.id)}
                    className="text-xs text-(--text-muted) hover:text-red-700"
                    aria-label={`Delete ${task.title}`}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form action={createFormAction} className="mt-4 flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-3 shadow-card">
          <input type="hidden" name="dueDate" value={selectedDate} readOnly />
          <div className="flex gap-2">
            <input
              name="title"
              type="text"
              required
              placeholder="Add a task for this day…"
              className="flex-1 rounded-md border border-black/15 px-3 py-1.5 text-sm"
            />
            <button
              type="submit"
              className="rounded-full bg-(--brand-primary) px-4 py-1.5 text-sm text-white hover:brightness-90 active:scale-95 transition"
            >
              Add
            </button>
          </div>
          <input
            name="notes"
            type="text"
            placeholder="Notes (optional)"
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm"
          />
          {createState.error && <p className="text-sm text-red-700">{createState.error}</p>}
        </form>
      </section>
    </div>
  );
}
