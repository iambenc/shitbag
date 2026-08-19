"use client";

import { useActionState } from "react";
import { completeOnboardingAction, type ExperienceState } from "@/lib/actions/onboarding/experience";
import { expertiseLevelEnum, type ExpertiseLevel } from "@/db/schema";
import { expertiseLevelLabels } from "@/lib/onboarding/labels";
import { NumberStepper } from "@/components/onboarding/NumberStepper";

const initialState: ExperienceState = {};

export function ExperienceForm({
  initial,
}: {
  initial: {
    expertiseLevel: ExpertiseLevel | null;
    weekdayHoursAvailable: number | null;
    weekendHoursAvailable: number | null;
  };
}) {
  const [state, formAction, pending] = useActionState(completeOnboardingAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Gardening experience</legend>
        <div className="flex gap-2">
          {expertiseLevelEnum.map((level) => (
            <label
              key={level}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-black/15 px-3 py-2 text-sm has-checked:border-(--brand-primary) has-checked:bg-(--brand-primary)/10"
            >
              <input
                type="radio"
                name="expertiseLevel"
                value={level}
                required
                defaultChecked={initial.expertiseLevel === level}
                className="accent-(--brand-primary)"
              />
              {expertiseLevelLabels[level]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 sm:flex-row">
        <NumberStepper
          name="weekdayHoursAvailable"
          label="Hours you can spend gardening on a weekday"
          min={0}
          max={24}
          step={0.5}
          required
          defaultValue={initial.weekdayHoursAvailable ?? undefined}
        />
        <NumberStepper
          name="weekendHoursAvailable"
          label="Hours you can spend gardening on a weekend day"
          min={0}
          max={24}
          step={0.5}
          required
          defaultValue={initial.weekendHoursAvailable ?? undefined}
        />
      </div>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
      >
        {pending ? "Finishing…" : "Finish setup"}
      </button>
    </form>
  );
}
