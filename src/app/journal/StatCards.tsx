"use client";

import type { JournalIcon } from "@/components/icons";

export type JournalStatCard = {
  key: string;
  icon: typeof JournalIcon;
  value: string;
  label: string;
  sub: string;
};

export function StatCards({ cards }: { cards: JournalStatCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.key} className="flex items-center gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--surface-tint) text-(--brand-primary)">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight">{card.value}</p>
              <p className="truncate text-xs text-(--text-muted)">{card.label}</p>
              <p className="truncate text-[10px] text-(--text-muted)">{card.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
