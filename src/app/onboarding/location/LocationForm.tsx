"use client";

import { useActionState } from "react";
import { saveLocationAction, type LocationState } from "@/lib/actions/onboarding/location";

const initialState: LocationState = {};

export function LocationForm({ initialPostcode }: { initialPostcode: string | null }) {
  const [state, formAction, pending] = useActionState(saveLocationAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Postcode
        <input
          name="postcode"
          type="text"
          required
          autoComplete="postal-code"
          defaultValue={initialPostcode ?? ""}
          placeholder="e.g. SW1A 1AA"
          className="rounded-md border border-black/15 px-3 py-2"
        />
      </label>
      <p className="text-sm text-(--text-muted)">
        We use this to work out your local sowing dates and weather.
      </p>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
      >
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
