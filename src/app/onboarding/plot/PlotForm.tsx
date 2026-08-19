"use client";

import { useActionState } from "react";
import { savePlotAction, type PlotState } from "@/lib/actions/onboarding/plot";
import { plotSizeEnum, type PlotSize } from "@/db/schema";
import { plotSizeLabels } from "@/lib/onboarding/labels";
import { NumberStepper } from "@/components/onboarding/NumberStepper";

// Kept in sync with plotSchema's own householdSize.max in
// src/lib/actions/onboarding/plot.ts — both are the same business rule
// (10 is a deliberately generous ceiling for a household size, not a
// technical limit), so this UI cap and the server-side validation cap must
// always agree.
const MAX_HOUSEHOLD_SIZE = 10;

const initialState: PlotState = {};

export function PlotForm({
  initial,
}: {
  initial: {
    plotSize: PlotSize | null;
    avgSunlightHours: number | null;
    householdSize: number | null;
    hasIndoorSeedlingSpace: boolean | null;
  };
}) {
  const [state, formAction, pending] = useActionState(savePlotAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Plot size</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {plotSizeEnum.map((size) => (
            <label
              key={size}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm has-checked:border-(--brand-primary) has-checked:bg-(--brand-primary)/10"
            >
              <input
                type="radio"
                name="plotSize"
                value={size}
                required
                defaultChecked={initial.plotSize === size}
                className="accent-(--brand-primary)"
              />
              {plotSizeLabels[size]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 sm:flex-row">
        <NumberStepper
          name="avgSunlightHours"
          label="Average hours of sunlight per day"
          min={0}
          max={24}
          step={0.5}
          required
          defaultValue={initial.avgSunlightHours ?? undefined}
        />
        <NumberStepper
          name="householdSize"
          label="People in your household"
          min={1}
          max={MAX_HOUSEHOLD_SIZE}
          step={1}
          required
          defaultValue={initial.householdSize ?? undefined}
        />
      </div>

      <label className="relative flex cursor-pointer items-center justify-between gap-3 rounded-md border border-black/15 px-4 py-3 text-sm transition has-checked:border-(--brand-primary) has-checked:bg-(--brand-primary)/10">
        I have indoor space (windowsill, greenhouse, etc.) for starting seedlings early
        {/* Visually replaced by the track/thumb span below (opacity-0, not
            display:none/sr-only) — a real native checkbox still sits over
            the whole control so it stays keyboard/screen-reader operable
            and Playwright's .check()/.click() (which requires a genuinely
            visible, non-zero-size target) keeps working exactly as before. */}
        <input
          name="hasIndoorSeedlingSpace"
          type="checkbox"
          defaultChecked={initial.hasIndoorSeedlingSpace ?? false}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className="relative h-6 w-11 shrink-0 rounded-full bg-black/20 transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-(--brand-primary) peer-checked:after:translate-x-5"
        />
      </label>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
