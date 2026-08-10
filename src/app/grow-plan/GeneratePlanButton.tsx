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

  async function handleClick() {
    setPending(true);
    await generateGrowPlanAction();
  }

  return (
    <button type="button" onClick={handleClick} disabled={pending} className={`${className} disabled:opacity-50`}>
      {label}
    </button>
  );
}
