"use client";

import type { EquipmentIcon } from "@/components/icons";

export type StatCard = {
  key: string;
  icon: typeof EquipmentIcon;
  label: string;
  primary: string;
  secondary: string;
  viewLabel: string;
  onView: () => void;
};

// Pure display — every number is computed by the caller from real,
// already-fetched seed/equipment rows (see MyShedView.tsx). No packet
// counts or other invented units here.
export function StatCards({ cards }: { cards: StatCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.key} className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-4 shadow-card">
            <Icon className="h-6 w-6 text-(--brand-primary)" />
            <p className="text-sm font-medium">{card.label}</p>
            <p className="text-lg font-semibold">{card.primary}</p>
            <p className="text-xs text-(--text-muted)">{card.secondary}</p>
            <button
              type="button"
              onClick={card.onView}
              className="mt-1 self-start rounded-md border border-black/15 px-3 py-1.5 text-xs font-medium hover:bg-black/5"
            >
              {card.viewLabel} →
            </button>
          </div>
        );
      })}
    </div>
  );
}
