"use client";

import Image from "next/image";
import Link from "next/link";
import { LeafAccent } from "@/components/LeafAccent";
import { GROWING_AREA_ILLUSTRATION_SRC } from "@/lib/garden/illustrations";
import { SLUG_TO_GROWING_AREA_TYPE } from "@/lib/garden/equipmentMapping";
import type { ShedEquipmentRow } from "./types";

type StructureCard = { equipmentTypeId: string; slug: string; typeName: string; totalQuantity: number };

// One card per equipment TYPE (not per row) — a user can own several
// differently-sized greenhouses as separate rows of the same "Greenhouses"
// type, so this aggregates quantity across a type's rows rather than
// rendering one card per row. Per-item breakdown (sizes, positions) already
// lives on /garden's GrowingAreaManager — not duplicated here.
function groupByType(rows: ShedEquipmentRow[]): StructureCard[] {
  const byType = new Map<string, StructureCard>();
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

export function GardenStructuresGrid({ rows }: { rows: ShedEquipmentRow[] }) {
  const cards = groupByType(rows);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Garden structures</h2>
        <p className="text-sm text-(--text-muted)">Raised beds, greenhouses, cold frames and more.</p>
      </div>

      {cards.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
          <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
          <p className="text-sm text-(--text-muted)">You don&rsquo;t own any garden structures yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => {
            const growingAreaType = SLUG_TO_GROWING_AREA_TYPE[card.slug];
            const src = growingAreaType ? GROWING_AREA_ILLUSTRATION_SRC[growingAreaType] : undefined;
            return (
              <div key={card.equipmentTypeId} className="flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-card">
                <div className="relative h-24 w-full shrink-0 bg-(--surface-tint)">
                  {src && <Image src={src} alt="" fill sizes="200px" className="object-contain p-3" />}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="font-medium">{card.typeName}</p>
                  <p className="text-xs text-(--text-muted)">
                    {card.totalQuantity} {card.totalQuantity === 1 ? "item" : "items"}
                  </p>
                  <Link href="/garden" className="mt-auto text-xs text-(--brand-primary) underline">
                    View details →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
