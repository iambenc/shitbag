"use client";

import { useActionState } from "react";
import { savePlotAction, type PlotState } from "@/lib/actions/onboarding/plot";
import { plotSizeEnum, type PlotSize } from "@/db/schema";
import { plotSizeLabels } from "@/lib/onboarding/labels";

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

      <label className="flex flex-col gap-1 text-sm">
        Average hours of sunlight per day
        <input
          name="avgSunlightHours"
          type="number"
          min={0}
          max={24}
          step={0.5}
          required
          defaultValue={initial.avgSunlightHours ?? undefined}
          className="rounded-md border border-black/15 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        People in your household
        <input
          name="householdSize"
          type="number"
          min={1}
          max={20}
          required
          defaultValue={initial.householdSize ?? undefined}
          className="rounded-md border border-black/15 px-3 py-2"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          name="hasIndoorSeedlingSpace"
          type="checkbox"
          defaultChecked={initial.hasIndoorSeedlingSpace ?? false}
          className="accent-(--brand-primary)"
        />
        I have indoor space (windowsill, greenhouse, etc.) for starting seedlings early
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
