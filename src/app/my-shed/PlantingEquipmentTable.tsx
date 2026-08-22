"use client";

import { useState } from "react";
import Image from "next/image";
import { LeafAccent } from "@/components/LeafAccent";
import { GROWING_AREA_ILLUSTRATION_SRC } from "@/lib/garden/illustrations";
import { SLUG_TO_GROWING_AREA_TYPE } from "@/lib/garden/equipmentMapping";
import type { ShedEquipmentRow } from "./types";

const SHOWN_BY_DEFAULT = 5;

function sizeDetails(row: ShedEquipmentRow): string {
  if (row.sizeValue != null) return `${row.sizeValue}${row.sizeUnit === "litres" ? "L" : "cm"}`;
  if (row.widthCm != null && row.lengthCm != null) {
    const dims = [row.widthCm, row.lengthCm, row.depthCm, row.heightCm].filter((v): v is number => v != null);
    return `${dims.join(" x ")}cm`;
  }
  return "—";
}

// Read-only summary — no per-row edit/delete here. applyEquipmentRows
// (equipmentRows.ts) syncs a user's ENTIRE userEquipment set from one
// submission; a scoped per-row action here would need its own mutation
// path, or risk deleting equipment this table never touched. Editing always
// goes through the one full EquipmentPicker form via onEdit.
export function PlantingEquipmentTable({ rows, onEdit }: { rows: ShedEquipmentRow[]; onEdit: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, SHOWN_BY_DEFAULT);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Planting equipment</h2>
          <p className="text-sm text-(--text-muted)">Pots, trays and planters and their sizes.</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
        >
          Edit equipment
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
          <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
          <p className="text-sm text-(--text-muted)">You don&rsquo;t own any pots, trays or planters yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white shadow-card">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs text-(--text-muted)">
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Size / Details</th>
                <th className="px-4 py-3 font-medium">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const growingAreaType = SLUG_TO_GROWING_AREA_TYPE[row.slug];
                const src = growingAreaType ? GROWING_AREA_ILLUSTRATION_SRC[growingAreaType] : undefined;
                return (
                  <tr key={row.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-(--surface-tint)">
                          {src && <Image src={src} alt="" width={40} height={40} className="h-full w-full object-contain p-1" />}
                        </div>
                        <p className="font-medium">{row.typeName}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-(--text-muted)">{sizeDetails(row)}</td>
                    <td className="px-4 py-3">{row.quantity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > SHOWN_BY_DEFAULT && (
            <div className="flex items-center justify-between border-t border-black/10 px-4 py-3 text-xs text-(--text-muted)">
              <span>
                Showing {visible.length} of {rows.length} items
              </span>
              <button type="button" onClick={() => setShowAll((s) => !s)} className="text-(--brand-primary) underline">
                {showAll ? "Show less" : "View all equipment"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
