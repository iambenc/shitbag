"use client";

import { useState } from "react";
import { syncGrowingAreasAction } from "@/lib/actions/garden/syncGrowingAreas";
import { growingAreaTypeLabels, growingAreaTypeEmoji, formatSizeValue } from "@/lib/garden/labels";
import type { GrowingAreaType, SizeUnit } from "@/db/schema";

type Occupant = { cropName: string; cropEmoji: string };

type EquipmentRow = {
  userEquipmentId: string;
  name: string;
  type: GrowingAreaType;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
  quantityOwned: number;
  placedCount: number;
  occupants: Occupant[];
  reserved: Occupant[];
};

function sizeText(row: Pick<EquipmentRow, "sizeValue" | "sizeUnit" | "widthCm" | "lengthCm" | "depthCm">) {
  const sized = formatSizeValue(row.sizeValue, row.sizeUnit);
  if (sized) return sized;
  if (row.widthCm && row.lengthCm) {
    return `${row.widthCm}×${row.lengthCm}${row.depthCm ? `×${row.depthCm}` : ""}cm`;
  }
  return null;
}

const MAX_CARD_PX = 88;
const MIN_CARD_PX = 28;

function VisualizationCard({
  row,
  index,
  occupant,
  reservedFor,
}: {
  row: EquipmentRow;
  index: number;
  occupant?: Occupant;
  reservedFor?: Occupant;
}) {
  const emoji = occupant?.cropEmoji ?? reservedFor?.cropEmoji ?? growingAreaTypeEmoji[row.type];
  const label = occupant?.cropName ?? reservedFor?.cropName ?? growingAreaTypeLabels[row.type];
  const size = sizeText(row);

  let boxStyle: React.CSSProperties | undefined;
  if (row.widthCm && row.lengthCm) {
    const scale = MAX_CARD_PX / Math.max(row.widthCm, row.lengthCm, 1);
    boxStyle = {
      width: Math.max(MIN_CARD_PX, Math.round(row.widthCm * scale)),
      height: Math.max(MIN_CARD_PX, Math.round(row.lengthCm * scale)),
    };
  }

  return (
    <div
      key={`${row.userEquipmentId}-${index}`}
      className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center ${
        occupant
          ? "border-(--brand-primary)/30 bg-(--brand-primary)/5"
          : reservedFor
            ? "border-(--color-terracotta)/30 bg-(--color-terracotta)/5"
            : "border-black/10 bg-white"
      }`}
    >
      <div
        className="flex items-center justify-center rounded-md bg-(--brand-primary)/10 text-2xl"
        style={boxStyle ?? { width: MIN_CARD_PX, height: MIN_CARD_PX }}
      >
        {emoji}
      </div>
      <span className="text-xs font-medium">{label}</span>
      {occupant ? (
        <span className="text-[11px] text-(--brand-primary)">Growing</span>
      ) : reservedFor ? (
        <span className="text-[11px] text-(--color-terracotta)">Reserved</span>
      ) : (
        size && <span className="text-[11px] text-(--text-muted)">{size}</span>
      )}
    </div>
  );
}

export function GrowingAreaManager({ equipment }: { equipment: EquipmentRow[] }) {
  const [rows, setRows] = useState(equipment);
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

  const visualCards = rows.flatMap((row) =>
    Array.from({ length: row.placedCount }, (_, i) => ({
      row,
      i,
      occupant: row.occupants[i],
      reservedFor: row.occupants[i] ? undefined : row.reserved[i - row.occupants.length],
    })),
  );

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-sm font-medium text-(--text-muted)">Your plot right now</h2>
        {visualCards.length === 0 ? (
          <p className="mt-3 text-sm text-(--text-muted)">
            Nothing placed yet — use the steppers below to add growing space.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            {visualCards.map(({ row, i, occupant, reservedFor }) => (
              <VisualizationCard
                key={`${row.userEquipmentId}-${i}`}
                row={row}
                index={i}
                occupant={occupant}
                reservedFor={reservedFor}
              />
            ))}
          </div>
        )}
      </section>

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
              className="flex items-center justify-between gap-4 rounded-lg border border-black/10 bg-white p-4"
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
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-black/15 disabled:opacity-40"
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
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-(--brand-primary) text-white disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
