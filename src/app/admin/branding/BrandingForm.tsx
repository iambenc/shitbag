"use client";

import { useActionState } from "react";
import { updateBrandingAction, type ActionState } from "@/lib/actions/admin";

const initialState: ActionState = {};

type Tenant = {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  customDomain: string | null;
};

export function BrandingForm({ tenant }: { tenant: Tenant }) {
  const [state, formAction, pending] = useActionState(updateBrandingAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-6 shadow-card">
      <label className="flex flex-col gap-1 text-sm">
        Display name
        <input
          name="displayName"
          defaultValue={tenant.displayName}
          required
          className="rounded-md border border-black/15 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Logo URL
        <input
          name="logoUrl"
          type="url"
          defaultValue={tenant.logoUrl ?? ""}
          placeholder="https://..."
          className="rounded-md border border-black/15 px-3 py-2"
        />
      </label>
      <div className="flex gap-6">
        <label className="flex flex-col gap-1 text-sm">
          Primary color
          <input
            name="primaryColor"
            type="color"
            defaultValue={tenant.primaryColor}
            className="h-10 w-16 rounded border border-black/15"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Secondary color
          <input
            name="secondaryColor"
            type="color"
            defaultValue={tenant.secondaryColor}
            className="h-10 w-16 rounded border border-black/15"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Custom domain
        <input
          name="customDomain"
          defaultValue={tenant.customDomain ?? ""}
          placeholder="garden.example.com"
          className="rounded-md border border-black/15 px-3 py-2"
        />
        <span className="text-xs text-(--text-muted)">
          Saved here, but not yet provisioned — no live DNS check runs.
        </span>
      </label>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">Saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white hover:brightness-90 active:scale-95 transition disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save branding"}
      </button>
    </form>
  );
}
