"use client";

import { PeopleIcon } from "@/components/icons";
import { LeafAccent } from "@/components/LeafAccent";
import type { HarvestRow } from "./types";
import type { MostHarvested } from "@/lib/journal/aggregates";

export function Sidebar({
  mostHarvested,
  recentHarvests,
  onViewAllHarvests,
  onGoToCommunity,
}: {
  mostHarvested: MostHarvested | null;
  recentHarvests: HarvestRow[];
  onViewAllHarvests: () => void;
  onGoToCommunity: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-black/10 bg-white p-4 shadow-card">
        <p className="font-display text-base font-semibold">This year at a glance</p>

        <div className="mt-3 rounded-lg bg-(--surface-tint) p-4 text-center">
          <p className="text-xs font-medium text-(--text-muted)">Most harvested</p>
          {mostHarvested ? (
            <>
              <p aria-hidden="true" className="mt-2 text-5xl">
                {mostHarvested.cropEmoji}
              </p>
              <p className="mt-2 font-display text-base font-semibold">{mostHarvested.cropName}</p>
              <p className="text-xs text-(--text-muted)">{mostHarvested.totalKg.toFixed(1)} kg</p>
            </>
          ) : (
            <div className="mt-2 flex flex-col items-center gap-1 py-2">
              <LeafAccent className="h-6 w-6 text-(--brand-primary)" />
              <p className="text-xs text-(--text-muted)">Log a harvest by weight to see this.</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-black/10 bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <p className="font-display text-base font-semibold">Recent harvests</p>
          <button type="button" onClick={onViewAllHarvests} className="text-xs text-(--brand-primary) underline">
            View all
          </button>
        </div>
        {recentHarvests.length === 0 ? (
          <p className="mt-2 text-sm text-(--text-muted)">Nothing logged yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-black/5">
            {recentHarvests.map((h) => (
              <li key={h.id} className="flex items-center gap-2 py-2 text-sm">
                <span aria-hidden="true" className="text-lg">
                  {h.cropEmoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{h.cropName}</p>
                  <p className="text-xs text-(--text-muted)">
                    {h.quantity}
                    {h.unit} · {h.harvestedAt}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-black/10 bg-white p-4 shadow-card">
        <p className="flex items-center gap-1.5 font-display text-base font-semibold">
          <PeopleIcon className="h-4 w-4 text-(--brand-primary)" />
          Share your journey
        </p>
        <p className="mt-1 text-sm text-(--text-muted)">Share your photos and harvests with other Edurnity gardeners.</p>
        <button
          type="button"
          onClick={onGoToCommunity}
          className="mt-3 flex items-center gap-1.5 rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
        >
          <PeopleIcon className="h-4 w-4" />
          Go to Community
        </button>
      </div>
    </div>
  );
}
