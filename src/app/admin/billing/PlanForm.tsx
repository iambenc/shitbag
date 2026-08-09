"use client";

import { useActionState } from "react";
import { upsertTenantPlanAction, type ActionState } from "@/lib/actions/admin";
import { CURRENCY_OPTIONS } from "@/lib/actions/adminConstants";

const initialState: ActionState = {};

type Plan = { monthlyAmount: string; currency: string; trialDays: number; stripePriceId: string };

export function PlanForm({ plan }: { plan: Plan }) {
  const [state, formAction, pending] = useActionState(upsertTenantPlanAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-6">
      <label className="flex flex-col gap-1 text-sm">
        Monthly amount
        <input
          name="monthlyAmount"
          type="number"
          min="0.01"
          step="0.01"
          defaultValue={plan.monthlyAmount}
          required
          className="rounded-md border border-black/15 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Currency
        <select name="currency" defaultValue={plan.currency} className="rounded-md border border-black/15 px-3 py-2">
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Trial days
        <input
          name="trialDays"
          type="number"
          min="0"
          step="1"
          defaultValue={plan.trialDays}
          className="rounded-md border border-black/15 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Stripe price ID (optional)
        <input
          name="stripePriceId"
          defaultValue={plan.stripePriceId}
          placeholder="price_..."
          className="rounded-md border border-black/15 px-3 py-2"
        />
      </label>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">Saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save plan"}
      </button>
    </form>
  );
}
