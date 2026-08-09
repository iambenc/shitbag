"use client";

import { useActionState, useState } from "react";
import { upsertAIConfigAction, type ActionState } from "@/lib/actions/admin";

const initialState: ActionState = {};

type Config = { provider: string; model: string; isActive: boolean; configured: boolean };

export function AIConfigForm({ agent, config }: { agent: string; config: Config }) {
  const [state, formAction, pending] = useActionState(upsertAIConfigAction, initialState);
  const [clearKey, setClearKey] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4">
      <input type="hidden" name="agent" value={agent} />
      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Provider
          <input
            name="provider"
            defaultValue={config.provider}
            className="rounded-md border border-black/15 px-3 py-2"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Model
          <input name="model" defaultValue={config.model} className="rounded-md border border-black/15 px-3 py-2" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        API key{" "}
        {config.configured ? (
          <span className="text-green-700">(configured)</span>
        ) : (
          <span className="text-[#1f2a1f]/50">(not configured — using platform default)</span>
        )}
        <input
          name="apiKey"
          type="password"
          placeholder={config.configured ? "Leave blank to keep the current key" : "Paste an API key"}
          disabled={clearKey}
          className="rounded-md border border-black/15 px-3 py-2 disabled:opacity-50"
        />
      </label>
      {config.configured && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="clearKey"
            checked={clearKey}
            onChange={(e) => setClearKey(e.target.checked)}
          />
          Clear the stored key
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={config.isActive} />
        Active
      </label>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">Saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
