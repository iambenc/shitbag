"use client";

import { LeafAccent } from "@/components/LeafAccent";
import {
  WateringCanIcon,
  TrowelIcon,
  ForkIcon,
  ScissorsIcon,
  GlovesIcon,
  SpadeIcon,
  RakeIcon,
  HoeIcon,
  WheelbarrowIcon,
  StorageBoxIcon,
  MeasuringTapeIcon,
  EquipmentIcon,
} from "@/components/icons";
import type { ShedEquipmentRow } from "./types";

const TOOL_ICON_BY_SLUG: Record<string, typeof WateringCanIcon> = {
  "watering-can": WateringCanIcon,
  "hand-trowel": TrowelIcon,
  "hand-fork": ForkIcon,
  secateurs: ScissorsIcon,
  "garden-gloves": GlovesIcon,
  spade: SpadeIcon,
  "garden-fork": ForkIcon,
  rake: RakeIcon,
  hoe: HoeIcon,
  wheelbarrow: WheelbarrowIcon,
  "storage-box": StorageBoxIcon,
  "measuring-tape": MeasuringTapeIcon,
};

type ToolCard = { equipmentTypeId: string; slug: string; typeName: string; totalQuantity: number };

function groupByType(rows: ShedEquipmentRow[]): ToolCard[] {
  const byType = new Map<string, ToolCard>();
  for (const row of rows) {
    const existing = byType.get(row.equipmentTypeId);
    if (existing) {
      existing.totalQuantity += row.quantity;
    } else {
      byType.set(row.equipmentTypeId, {
        equipmentTypeId: row.equipmentTypeId,
        slug: row.slug,
        typeName: row.typeName,
        totalQuantity: row.quantity,
      });
    }
  }
  return [...byType.values()];
}

export function ToolsGrid({ rows, onEdit }: { rows: ShedEquipmentRow[]; onEdit: () => void }) {
  const cards = groupByType(rows);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Tools &amp; equipment</h2>
          <p className="text-sm text-(--text-muted)">Hand tools and other equipment you use in the garden.</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
        >
          Edit equipment
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
          <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
          <p className="text-sm text-(--text-muted)">You don&rsquo;t own any tools yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => {
            const Icon = TOOL_ICON_BY_SLUG[card.slug] ?? EquipmentIcon;
            return (
              <div key={card.equipmentTypeId} className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-4 shadow-card">
                <Icon className="h-8 w-8 text-(--brand-primary)" />
                <p className="font-medium">{card.typeName}</p>
                <p className="text-xs text-(--text-muted)">
                  {card.totalQuantity} {card.totalQuantity === 1 ? "item" : "items"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
