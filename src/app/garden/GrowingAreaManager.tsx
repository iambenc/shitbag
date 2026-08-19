"use client";

import { useState } from "react";
import Link from "next/link";
import { syncGrowingAreasAction } from "@/lib/actions/garden/syncGrowingAreas";
import { growingAreaTypeEmoji, formatSizeValue } from "@/lib/garden/labels";
import type { GrowingAreaType, SizeUnit } from "@/db/schema";

type EquipmentRow = {
  userEquipmentId: string;
  name: string;
  type: GrowingAreaType;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
  heightCm: number | null;
  quantityOwned: number;
  placedCount: number;
};

function sizeText(row: Pick<EquipmentRow, "sizeValue" | "sizeUnit" | "widthCm" | "lengthCm" | "depthCm" | "heightCm">) {
  const sized = formatSizeValue(row.sizeValue, row.sizeUnit);
  const dims = sized ?? (row.widthCm && row.lengthCm ? `${row.widthCm}×${row.lengthCm}${row.depthCm ? `×${row.depthCm}` : ""}cm` : null);
  if (dims && row.heightCm) return `${dims}, ${row.heightCm}cm tall`;
  return dims;
}

export function GrowingAreaManager({ equipment }: { equipment: EquipmentRow[] }) {
  const [rows, setRows] = useState(equipment);
  // useState(equipment) only seeds the initial value — it never re-runs on
  // its own when the parent Server Component (GardenPage) re-renders with a
  // fresh `equipment` prop (e.g. after EquipmentPicker's save action calls
  // revalidatePath). Without correcting for that, adding a pot auto-places
  // it correctly in the database immediately, but this component kept
  // showing the stale pre-save state until a full page reload — the actual
  // bug behind "newly added equipment should immediately show as placed."
  // Resetting during render (React's documented "adjusting state when a
  // prop changes" pattern — react.dev/learn/you-might-not-need-an-effect)
  // rather than in a useEffect avoids an extra render showing stale content
  // before the correction lands. The one place this component owns a
  // genuine optimistic edit (changeCount below) already reconciles against
  // the server's own response, independent of this.
  const [prevEquipment, setPrevEquipment] = useState(equipment);
  if (equipment !== prevEquipment) {
    setPrevEquipment(equipment);
    setRows(equipment);
  }
  const [pending, setPending] = useState<string | null>(null);

  async function changeCount(userEquipmentId: string, desired: number) {
    const previous = rows.find((r) => r.userEquipmentId === userEquipmentId)?.placedCount ?? 0;
    setRows((rs) =>
      rs.map((r) => (r.userEquipmentId === userEquipmentId ? { ...r, placedCount: desired } : r)),
    );
    setPending(userEquipmentId);
    const result = await syncGrowingAreasAction(userEquipmentId, desired);
    setPending(null);
    setRows((rs) =>
      rs.map((r) =>
        r.userEquipmentId === userEquipmentId
          ? { ...r, placedCount: result.ok ? result.count : previous }
          : r,
      ),
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-(--text-muted)">Place your equipment</h2>
        {rows.length === 0 && (
          <p className="text-sm text-(--text-muted)">
            You haven&apos;t recorded any pots, trays, planters, or beds yet.
          </p>
        )}
        {rows.map((row) => {
          const size = sizeText(row);
          return (
            <div
              key={row.userEquipmentId}
              className="flex items-center justify-between gap-4 rounded-lg border border-black/10 bg-white p-4 shadow-card"
            >
              <div>
                <p className="text-sm font-medium">
                  {growingAreaTypeEmoji[row.type]} {row.name}
                  {size && <span className="text-(--text-muted)"> · {size}</span>}
                </p>
                <p className="text-xs text-(--text-muted)">You own {row.quantityOwned}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => changeCount(row.userEquipmentId, row.placedCount - 1)}
                  disabled={row.placedCount <= 0 || pending === row.userEquipmentId}
                  aria-label={`Remove one placed ${row.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 hover:bg-black/10 active:scale-95 transition disabled:opacity-40"
                >
                  –
                </button>
                <span className="w-16 text-center text-sm">
                  {row.placedCount} placed
                </span>
                <button
                  type="button"
                  onClick={() => changeCount(row.userEquipmentId, row.placedCount + 1)}
                  disabled={row.placedCount >= row.quantityOwned || pending === row.userEquipmentId}
                  aria-label={`Add one placed ${row.name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-(--brand-primary) text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <Link
        href="/garden/layout"
        className="flex items-center gap-2 rounded-lg border border-black/10 bg-white p-4 shadow-card hover:border-(--brand-primary)/40 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
      >
        <div>
          <p className="font-display text-lg font-semibold">🗺️ Plan your layout</p>
          <p className="mt-1 text-sm text-(--text-muted)">
            See your plot from above and drag your growing areas into place.
          </p>
        </div>
      </Link>
    </div>
  );
}
