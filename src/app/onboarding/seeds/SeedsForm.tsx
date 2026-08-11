"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveSeedsAction, type SeedsState } from "@/lib/actions/onboarding/seeds";
import { nextOnboardingStep } from "@/lib/onboarding/steps";

type CropOption = { id: string; name: string; emoji: string };
type Row = { key: string; cropId: string; quantityLabel: string };

const initialState: SeedsState = {};

export function SeedsForm({
  crops,
  initialRows,
}: {
  crops: CropOption[];
  initialRows: { cropId: string; quantityLabel: string }[];
}) {
  const [state, formAction, pending] = useActionState(saveSeedsAction, initialState);
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows.map((r) => ({
      key: `${r.cropId}-${Math.random().toString(36).slice(2)}`,
      cropId: r.cropId,
      quantityLabel: r.quantityLabel,
    })),
  );

  function addRow() {
    setRows((rs) => [
      ...rs,
      { key: `row-${Math.random().toString(36).slice(2)}`, cropId: crops[0]?.id ?? "", quantityLabel: "1 packet" },
    ]);
  }
  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  const validRows = rows.filter((r) => r.cropId && r.quantityLabel.trim());
  const serializedRows = JSON.stringify(
    validRows.map((r) => ({ cropId: r.cropId, quantityLabel: r.quantityLabel })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="rows" value={serializedRows} readOnly />

      {rows.length === 0 && (
        <p className="text-sm text-(--text-muted)">No seeds added yet — add any you already own, or skip.</p>
      )}

      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            Crop
            <select
              value={row.cropId}
              onChange={(e) => updateRow(row.key, { cropId: e.target.value })}
              className="w-48 rounded-md border border-black/15 px-2 py-1.5 text-sm"
            >
              {crops.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Quantity
            <input
              type="text"
              value={row.quantityLabel}
              onChange={(e) => updateRow(row.key, { quantityLabel: e.target.value })}
              placeholder="e.g. 1 packet"
              className="w-32 rounded-md border border-black/15 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => removeRow(row.key)}
            className="rounded-md border border-black/15 px-2 py-1.5 text-xs hover:bg-black/5"
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        disabled={crops.length === 0}
        className="self-start text-sm text-(--brand-primary) underline"
      >
        + Add seeds you own
      </button>

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <div className="mt-2 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-(--brand-primary) px-6 py-2 text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
        >
          {pending ? "Saving…" : "Continue"}
        </button>
        <Link href={nextOnboardingStep("seeds")} className="text-sm text-(--text-muted) underline">
          Skip for now
        </Link>
      </div>
    </form>
  );
}
