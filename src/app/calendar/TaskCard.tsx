"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { CheckIcon, PinIcon, FlagIcon, MoreIcon, CameraIcon } from "@/components/icons";
import { TASK_CATEGORY_META } from "@/lib/calendar/taskCategory";
import type { Task } from "./types";

// Shared per-task card used by both the month view's selected-day sidebar
// and AgendaView.tsx — same component, so the two views can never drift out
// of sync on what a task looks like or which actions it exposes.
export function TaskCard({
  task,
  onToggle,
  onDelete,
  onCancelSeries,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onCancelSeries: (successionSeriesId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const meta = TASK_CATEGORY_META[task.category];
  const CategoryIcon = meta.icon;

  if (task.blurred) {
    // Never deleted from the DB, just hidden from view — this is purely a
    // display restriction. aria-hidden plus a tabIndex-free blurred block
    // keeps it out of the accessibility tree entirely, so a screen reader
    // doesn't announce content the visual UI is hiding.
    return (
      <li className="relative flex items-start gap-3 overflow-hidden rounded-lg border border-black/10 bg-white p-3">
        <div aria-hidden="true" className="pointer-events-none flex-1 select-none text-sm blur-sm">
          <span>{task.title}</span>
          {task.notes && <p className="text-xs text-(--text-muted)">{task.notes}</p>}
        </div>
        <Link
          href="/upgrade"
          className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/60 text-xs font-medium text-(--brand-primary) underline"
        >
          Resubscribe to see this
        </Link>
      </li>
    );
  }

  const missed = task.status === "missed";
  const completed = task.status === "completed";

  return (
    <li className={`relative flex gap-3 rounded-lg border p-3 ${missed ? "border-red-200 bg-red-50" : "border-black/10 bg-white"}`}>
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-(--surface-tint)">
        {task.illustrationSrc ? (
          <Image src={task.illustrationSrc} alt="" width={48} height={48} className="h-full w-full object-contain p-1" />
        ) : task.cropEmoji ? (
          <span aria-hidden="true" className="text-2xl">
            {task.cropEmoji}
          </span>
        ) : (
          <CategoryIcon className={`h-6 w-6 ${meta.accentClass}`} />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.badgeClass}`}
          >
            <CategoryIcon className="h-3 w-3" />
            {meta.label}
          </span>
          {task.source === "weather" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
              <FlagIcon className="h-3 w-3" />
              Adjusted for weather
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
          {task.seedBlocked && (
            <span
              className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800"
              title="Not enough seeds in your inventory — pushed back a week at a time until you have enough or order more"
            >
              Requires seeds
            </span>
          )}
          {missed && (
            <span className="rounded-full bg-red-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-800">
              Missed
            </span>
          )}
        </div>

        <p className={`mt-1 text-sm font-medium ${completed ? "text-(--text-muted) line-through" : missed ? "text-red-800" : ""}`}>
          {task.title}
        </p>
        {task.notes && <p className="mt-0.5 text-xs text-(--text-muted)">{task.notes}</p>}
        {(task.areaLabel || task.cropName) && (
          <p className="mt-1 flex items-center gap-1 text-xs text-(--text-muted)">
            <PinIcon className="h-3 w-3 shrink-0" />
            {[task.areaLabel, task.cropName].filter(Boolean).join(" • ")}
          </p>
        )}
        {task.hardDeadlineDate && <p className="mt-0.5 text-xs text-(--text-muted)">Last date: {task.hardDeadlineDate}</p>}

        <div className="mt-2 flex items-center gap-2">
          {task.growingAreaId ? (
            // A recurring weekly garden-health-check task — its job is "take
            // a photo of this area," not a plain checkbox, so it links to
            // the existing plant-health upload+diagnose page pre-scoped to
            // this area/task rather than completing here. Same exact link
            // pattern as TodayTasksCard.tsx — uploadAndDiagnoseAction marks
            // the task done itself once the photo is accepted.
            <Link
              href={`/plant-health?growingAreaId=${task.growingAreaId}&taskId=${task.id}`}
              className="flex items-center gap-1 rounded-full border border-(--brand-primary)/30 px-3 py-1 text-xs font-medium text-(--brand-primary) transition hover:bg-(--brand-primary)/10 active:scale-95"
            >
              <CameraIcon className="h-3.5 w-3.5" />
              Check plant
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => onToggle(task)}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition active:scale-95 ${
                completed
                  ? "border-black/15 bg-black/5 text-(--text-muted) hover:bg-black/10"
                  : "border-(--brand-primary)/30 text-(--brand-primary) hover:bg-(--brand-primary)/10"
              }`}
            >
              <CheckIcon className="h-3.5 w-3.5" />
              {completed ? "Completed" : "Mark complete"}
            </button>
          )}

          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-full p-1.5 text-(--text-muted) hover:bg-black/5"
              aria-label={`More actions for ${task.title}`}
              aria-expanded={menuOpen}
            >
              <MoreIcon className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg"
                onMouseLeave={() => setMenuOpen(false)}
              >
                {task.successionSeriesId && task.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onCancelSeries(task.successionSeriesId!);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs text-(--text-muted) hover:bg-black/5"
                  >
                    Cancel remaining
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(task.id);
                  }}
                  aria-label={`Delete ${task.title}`}
                  className="block w-full px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
