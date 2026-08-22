"use client";

import { useActionState, useMemo, useState } from "react";
import {
  createTaskAction,
  toggleTaskCompleteAction,
  deleteTaskAction,
  cancelSuccessionSeriesAction,
  type CreateTaskState,
} from "@/lib/actions/tasks";
import { LeafAccent } from "@/components/LeafAccent";
import { FlagIcon } from "@/components/icons";
import { weatherCodeIcon } from "@/lib/weather/labels";
import { getTaskCategory } from "@/lib/calendar/taskCategory";
import type { DailyForecast, CurrentWeather } from "@/lib/weather";
import { CalendarGrid, isoDate } from "./CalendarGrid";
import { AgendaView } from "./AgendaView";
import { TaskCard } from "./TaskCard";
import type { Task } from "./types";

function todayIso() {
  const d = new Date();
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

const initialCreateState: CreateTaskState = {};

export function CalendarView({
  initialTasks,
  initialHarvestDates,
  weeklyForecast,
  currentWeather,
}: {
  initialTasks: Task[];
  initialHarvestDates: string[];
  weeklyForecast: DailyForecast[] | null;
  currentWeather: CurrentWeather | null;
  postcode: string | null;
}) {
  const [viewMode, setViewMode] = useState<"month" | "agenda">("month");
  const [taskList, setTaskList] = useState(initialTasks);
  const today = todayIso();
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewYear, setViewYear] = useState(Number(today.slice(0, 4)));
  const [viewMonth, setViewMonth] = useState(Number(today.slice(5, 7)) - 1);

  const [createState, createFormAction] = useActionState(
    async (prev: CreateTaskState, formData: FormData) => {
      const result = await createTaskAction(prev, formData);
      if (result.task) {
        const t = result.task;
        setTaskList((ts) => [
          ...ts,
          {
            ...t,
            category: getTaskCategory({
              title: t.title,
              source: t.source,
              growingAreaId: null,
              estimatedSeedsUsed: null,
              activatesStageId: null,
            }),
            cropEmoji: null,
            cropName: null,
            growingAreaId: null,
            areaLabel: null,
            illustrationSrc: null,
          },
        ]);
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

  const harvestCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const date of initialHarvestDates) {
      map.set(date, (map.get(date) ?? 0) + 1);
    }
    return map;
  }, [initialHarvestDates]);

  const weatherByDate = useMemo(() => {
    const map = new Map<string, DailyForecast>();
    for (const day of weeklyForecast ?? []) {
      map.set(day.date, day);
    }
    return map;
  }, [weeklyForecast]);

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

  const selectedTasks = (tasksByDate.get(selectedDate) ?? []).slice().sort((a, b) => a.title.localeCompare(b.title));
  const weatherImpactTask = selectedTasks.find((t) => t.source === "weather" && t.notes);
  const dayForecast = weatherByDate.get(selectedDate);

  return (
    <div className="flex flex-col gap-6">
      <div className="inline-flex w-fit items-center gap-1 self-start rounded-full bg-black/5 p-1">
        {(
          [
            { mode: "month", label: "Month" },
            { mode: "agenda", label: "List View" },
          ] as const
        ).map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              viewMode === mode ? "bg-white text-(--brand-primary) shadow-card" : "text-(--text-muted) hover:text-(--text-heading)"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {viewMode === "month" ? (
          <div className="rounded-lg border border-black/10 bg-white p-4 shadow-card">
            <CalendarGrid
              viewYear={viewYear}
              viewMonth={viewMonth}
              onChangeMonth={changeMonth}
              today={today}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              tasksByDate={tasksByDate}
              harvestCountByDate={harvestCountByDate}
              weatherByDate={weatherByDate}
            />
          </div>
        ) : (
          <div>
            <AgendaView
              tasksByDate={tasksByDate}
              today={today}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onCancelSeries={handleCancelSeries}
            />
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-black/10 bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-semibold">
                {selectedDate === today
                  ? "Today"
                  : new Date(selectedDate).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <span className="rounded-full bg-(--brand-primary)/10 px-2.5 py-0.5 text-xs font-medium text-(--brand-primary)">
                {selectedTasks.length} task{selectedTasks.length === 1 ? "" : "s"}
              </span>
            </div>

            {selectedDate === today && currentWeather ? (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-(--text-muted)">
                {weatherCodeIcon(currentWeather.weatherCode)({ className: "h-5 w-5 text-(--brand-primary)" })}
                {Math.round(currentWeather.temperatureC)}° · feels like {Math.round(currentWeather.apparentTemperatureC)}°
              </div>
            ) : selectedDate !== today && dayForecast ? (
              <div className="mt-2 flex items-center gap-1.5 text-sm text-(--text-muted)">
                {weatherCodeIcon(dayForecast.weatherCode)({ className: "h-5 w-5 text-(--brand-primary)" })}
                {Math.round(dayForecast.maxTempC)}° / {Math.round(dayForecast.minTempC)}°
              </div>
            ) : null}

            {weatherImpactTask && (
              <div className="mt-3 rounded-md bg-blue-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-blue-800">
                  <FlagIcon className="h-3.5 w-3.5" />
                  {weatherImpactTask.title}
                </p>
                {weatherImpactTask.notes && <p className="mt-1 text-xs text-blue-700">{weatherImpactTask.notes}</p>}
              </div>
            )}
          </div>

          {viewMode === "month" &&
            (selectedTasks.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
                <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
                <p className="text-sm text-(--text-muted)">Nothing due this day.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {selectedTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onToggle={handleToggle} onDelete={handleDelete} onCancelSeries={handleCancelSeries} />
                ))}
              </ul>
            ))}

          <form action={createFormAction} className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-3 shadow-card">
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
                className="rounded-full bg-(--brand-primary) px-4 py-1.5 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
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
        </div>
      </div>
    </div>
  );
}
