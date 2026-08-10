"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptRecommendationAction, rejectRecommendationAction } from "@/lib/actions/recommendations";
import type { PlanRecommendationStatus } from "@/db/schema";

export function RecommendationActionButtons({
  recommendationIds,
  status,
  retriesRemaining,
}: {
  recommendationIds: string[];
  // Only "pending"/"accepted" are ever passed in practice (the page query
  // excludes "rejected", and "regenerating" renders RegeneratingCard
  // instead of this component) — typed against the full enum anyway so the
  // caller doesn't need a narrowing cast for a status the query already
  // guarantees won't occur.
  status: PlanRecommendationStatus;
  // How many more times this recommendation's lineage may still be
  // rejected-and-regenerated (see MAX_RECOMMENDATION_REGENERATIONS).
  retriesRemaining: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "reject" | null>(null);

  async function handleAccept() {
    setPending("accept");
    await acceptRecommendationAction(recommendationIds);
    router.refresh();
    setPending(null);
  }

  async function handleReject() {
    setPending("reject");
    await rejectRecommendationAction(recommendationIds);
    router.refresh();
    setPending(null);
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <button
        type="button"
        onClick={handleAccept}
        disabled={pending !== null}
        className={`rounded-full px-3 py-1 text-xs disabled:opacity-50 ${
          status === "accepted"
            ? "bg-(--brand-primary) text-white"
            : "border border-(--brand-primary)/40 text-(--brand-primary) hover:bg-(--brand-primary)/10"
        }`}
      >
        {status === "accepted" ? "✓ Accepted" : "Accept"}
      </button>
      {retriesRemaining > 0 ? (
        <>
          <button
            type="button"
            onClick={handleReject}
            disabled={pending !== null}
            className="rounded-full border border-black/15 px-3 py-1 text-xs text-(--text-muted) hover:bg-black/5 disabled:opacity-50"
          >
            Reject
          </button>
          <span className="text-xs text-(--text-muted)">{retriesRemaining} retries left</span>
        </>
      ) : (
        <span className="text-xs text-(--text-muted)">No retries left</span>
      )}
    </div>
  );
}
