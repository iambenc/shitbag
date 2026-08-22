"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction, type CreateTaskState } from "@/lib/actions/tasks";

// Local todayIso(), not an import from src/lib/dates.ts — same deliberate
// duplication CalendarView.tsx already uses for this exact reason (kept
// client-safe rather than depending on the server-side date helper module).
function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const initialState: CreateTaskState = {};

// Near-verbatim copy of CalendarView.tsx's own useActionState(createTaskAction)
// wiring, but with dueDate defaulted to today instead of a selected calendar
// day — reuses createTaskAction directly, no new server action needed.
export function QuickAddTaskForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(async (prev: CreateTaskState, formData: FormData) => {
    const result = await createTaskAction(prev, formData);
    if (result.task) {
      onDone();
      router.refresh();
    }
    return result;
  }, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-sm font-medium">Add a task for today</p>
      <input type="hidden" name="dueDate" value={todayIso()} readOnly />
      <input
        name="title"
        placeholder="e.g. Water the greenhouse"
        required
        className="rounded-md border border-black/15 px-3 py-2 text-sm"
      />
      {state.error && <p className="text-xs text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-(--brand-primary) px-4 py-1.5 text-sm text-white shadow-button transition hover:brightness-90 active:scale-95 disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add task"}
      </button>
    </form>
  );
}
