"use client";

import { useId, useState } from "react";

// A +/- controlled number input for the onboarding forms — still a real
// native <input type="number" name=... />, so it submits through a Server
// Action's FormData exactly like a plain number input would (required/min/
// max keep working as native HTML validation too); the buttons just give
// an easier way to change it than typing, especially on mobile where a
// bare <input type="number">'s spinner arrows are fiddly to hit.
export function NumberStepper({
  name,
  label,
  defaultValue,
  min = 0,
  max,
  step = 1,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: number;
  min?: number;
  max: number;
  step?: number;
  required?: boolean;
}) {
  const [value, setValue] = useState<number | "">(defaultValue ?? "");
  // Explicit htmlFor/id, not implicit <label>-wraps-<input> — a <label>
  // wrapping several labelable descendants (both buttons below are
  // labelable too, being real <button> elements) implicitly associates
  // with only the FIRST one per the HTML spec, which here would be the
  // decrease button, leaving the actual input with no accessible name at
  // all. Explicit association sidesteps that regardless of what else ends
  // up inside the label.
  const inputId = useId();

  function clamp(n: number): number {
    return Math.min(max, Math.max(min, n));
  }

  function adjust(delta: number) {
    setValue((v) => clamp((typeof v === "number" ? v : min) + delta));
  }

  return (
    <div className="flex flex-1 flex-col gap-1 text-sm">
      <label htmlFor={inputId}>{label}</label>
      <div className="flex items-center gap-2">
        {/* "Decrease"/"Increase" alone, not "Decrease {label}" — the
            latter's aria-label would contain the field's own label text as
            a substring, which getByLabel's default (non-exact) matching
            picks up as a second, ambiguous match alongside the real
            labelled input. The field's own <label> already gives these
            buttons context for a screen reader tabbing through the group. */}
        <button
          type="button"
          onClick={() => adjust(-step)}
          disabled={value !== "" && value <= min}
          aria-label="Decrease"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/15 text-lg leading-none hover:bg-black/5 active:scale-90 transition disabled:opacity-40"
        >
          &minus;
        </button>
        <input
          id={inputId}
          name={name}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          required={required}
          value={value}
          onChange={(e) => setValue(e.target.value === "" ? "" : clamp(Number(e.target.value)))}
          className="w-16 rounded-md border border-black/15 px-2 py-2 text-center"
        />
        <button
          type="button"
          onClick={() => adjust(step)}
          disabled={value !== "" && value >= max}
          aria-label="Increase"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/15 text-lg leading-none hover:bg-black/5 active:scale-90 transition disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
