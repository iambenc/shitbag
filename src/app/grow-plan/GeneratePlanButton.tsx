"use client";

import { useState } from "react";
import { generateGrowPlanAction } from "@/lib/actions/growPlan";

// Every other action button in this feature (RecommendationActionButtons)
// disables itself while its request is in flight — this one didn't, so a
// double-click or two open tabs could both fire generateGrowPlanAction
// before either redirect lands, burning two of the three daily slots at
// once. Mirrors that same pending-state shape.
export function GeneratePlanButton({ label, className }: { label: string; className: string }) {
  const [pending, setPending] = useState(false);
  const [wantsUnusualCrop, setWantsUnusualCrop] = useState(false);

  async function handleClick() {
    setPending(true);
    await generateGrowPlanAction(wantsUnusualCrop);
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card hover:border-(--brand-primary)/40 transition">
        <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
          <input
            type="checkbox"
            checked={wantsUnusualCrop}
            onChange={(e) => setWantsUnusualCrop(e.target.checked)}
            className="peer sr-only"
          />
          <span className="absolute inset-0 rounded-full bg-black/15 transition peer-checked:bg-(--brand-primary)" />
          <span className="absolute left-1 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold">🌱 Try something new</span>
          <span className="block text-xs text-(--text-muted)">
            Suggest one unusual UK-growable plant that isn&rsquo;t commonly grown
          </span>
        </span>
      </label>
      <button type="button" onClick={handleClick} disabled={pending} className={`${className} disabled:opacity-50`}>
        {label}
      </button>
    </div>
  );
}
