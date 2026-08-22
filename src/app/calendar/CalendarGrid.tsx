"use client";

import { motion } from "framer-motion";
import { ChevronLeftIcon, ChevronRightIcon, CarrotIcon } from "@/components/icons";
import { weatherCodeIcon, weatherCodeLabel } from "@/lib/weather/labels";
import { TASK_CATEGORY_META, gridCategoryFor, type TaskCategory } from "@/lib/calendar/taskCategory";
import type { DailyForecast } from "@/lib/weather";
import type { Task } from "./types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const LEGEND: { label: string; category: TaskCategory }[] = [
  { label: "Planting", category: "planting" },
  { label: "Watering", category: "watering" },
  { label: "Maintenance", category: "maintenance" },
  { label: "Health check", category: "health_check" },
  { label: "Other", category: "other" },
];

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
export function isoDate(year: number, monthIndex: number, day: number) {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function CalendarGrid({
  viewYear,
  viewMonth,
  onChangeMonth,
  today,
  selectedDate,
  onSelectDate,
  tasksByDate,
  harvestCountByDate,
  weatherByDate,
}: {
  viewYear: number;
  viewMonth: number;
  onChangeMonth: (delta: number) => void;
  today: string;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  tasksByDate: Map<string, Task[]>;
  harvestCountByDate: Map<string, number>;
  weatherByDate: Map<string, DailyForecast>;
}) {
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChangeMonth(-1)}
          className="rounded-full bg-black/5 p-1.5 hover:bg-black/10 active:scale-95 transition"
          aria-label="Previous month"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <p className="font-display font-medium">
          {MONTH_LABELS[viewMonth]} {viewYear}
        </p>
        <button
          type="button"
          onClick={() => onChangeMonth(1)}
          className="rounded-full bg-black/5 p-1.5 hover:bg-black/10 active:scale-95 transition"
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
          if (day === null) {
            return (
              <div
                key={`blank-${i}`}
                className="min-h-[64px] rounded-md border border-black/5 sm:min-h-[84px] lg:min-h-[100px]"
              />
            );
          }
          const date = isoDate(viewYear, viewMonth, day);
          const dayTasks = tasksByDate.get(date) ?? [];
          const categoryCounts = new Map<TaskCategory, number>();
          for (const t of dayTasks) {
            const cat = gridCategoryFor(t.category);
            categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
          }
          const harvestCount = harvestCountByDate.get(date) ?? 0;
          const forecast = weatherByDate.get(date);
          const WeatherIcon = forecast ? weatherCodeIcon(forecast.weatherCode) : null;
          const isSelected = date === selectedDate;
          const isToday = date === today;

          return (
            <button
              type="button"
              key={date}
              onClick={() => onSelectDate(date)}
              className={`relative flex min-h-[64px] flex-col overflow-hidden rounded-md border p-1 text-left transition sm:min-h-[84px] lg:min-h-[100px] ${
                isSelected
                  ? "border-(--brand-primary) text-white"
                  : isToday
                    ? "border-(--brand-primary)"
                    : "border-black/10 hover:bg-black/5"
              }`}
            >
              {isSelected && (
                <motion.div
                  layoutId="calendar-day-highlight"
                  className="absolute inset-0 bg-(--brand-primary)"
                  transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                />
              )}
              <div className="relative flex items-center justify-between text-sm">
                <span className={isToday && !isSelected ? "font-semibold text-(--brand-primary)" : ""}>{day}</span>
                {WeatherIcon && forecast && (
                  <span
                    className="flex items-center gap-0.5"
                    role="img"
                    aria-label={weatherCodeLabel(forecast.weatherCode)}
                    title={weatherCodeLabel(forecast.weatherCode)}
                  >
                    <WeatherIcon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden text-[10px] sm:inline">{Math.round(forecast.maxTempC)}°</span>
                  </span>
                )}
              </div>
              <div className="relative mt-auto flex flex-col gap-0.5 pt-1">
                {Array.from(categoryCounts.entries()).map(([cat, count]) => {
                  const meta = TASK_CATEGORY_META[cat];
                  const Icon = meta.icon;
                  return (
                    <span key={cat} className="flex items-center gap-1 text-[9px] leading-none" role="img" aria-label={meta.label}>
                      <Icon className={`h-2.5 w-2.5 shrink-0 ${isSelected ? "text-white" : meta.accentClass}`} />
                      <span>×{count}</span>
                    </span>
                  );
                })}
                {harvestCount > 0 && (
                  <span className="flex items-center gap-1 text-[9px] leading-none" role="img" aria-label="Harvest">
                    <CarrotIcon className={`h-2.5 w-2.5 shrink-0 ${isSelected ? "text-white" : "text-orange-600"}`} />
                    <span>×{harvestCount}</span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-black/10 pt-3 text-xs text-(--text-muted)">
        {LEGEND.map(({ label, category }) => {
          const Icon = TASK_CATEGORY_META[category].icon;
          return (
            <span key={category} className="flex items-center gap-1">
              <Icon className={`h-3 w-3 ${TASK_CATEGORY_META[category].accentClass}`} />
              {label}
            </span>
          );
        })}
        <span className="flex items-center gap-1">
          <CarrotIcon className="h-3 w-3 text-orange-600" />
          Harvest
        </span>
      </div>
    </div>
  );
}
