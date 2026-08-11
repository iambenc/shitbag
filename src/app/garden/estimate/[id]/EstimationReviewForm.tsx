"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmGrowingAreaProposalsAction } from "@/lib/actions/growingAreaEstimation";
import { growingAreaTypeEnum, type GrowingAreaType, type SizeUnit } from "@/db/schema";
import { growingAreaTypeLabels } from "@/lib/garden/labels";

type ProposedArea = {
  type: GrowingAreaType;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
  confidence: number;
  description: string;
};

type Row = {
  key: string;
  type: GrowingAreaType;
  sizeValue: string;
  sizeUnit: SizeUnit;
  widthCm: string;
  lengthCm: string;
  depthCm: string;
  confidence: number | null;
  description: string | null;
};

function toRow(area: ProposedArea, key: string): Row {
  return {
    key,
    type: area.type,
    sizeValue: area.sizeValue?.toString() ?? "",
    sizeUnit: area.sizeUnit ?? "cm",
    widthCm: area.widthCm?.toString() ?? "",
    lengthCm: area.lengthCm?.toString() ?? "",
    depthCm: area.depthCm?.toString() ?? "",
    confidence: area.confidence,
    description: area.description,
  };
}

function emptyRow(key: string): Row {
  return {
    key,
    type: "pot",
    sizeValue: "",
    sizeUnit: "cm",
    widthCm: "",
    lengthCm: "",
    depthCm: "",
    confidence: null,
    description: null,
  };
}

// Pots use a size+unit (diameter or volume); everything else uses
// width/length(+depth) — same split EquipmentPicker already uses, minus
// depth for a ground-level bed, where it isn't physically meaningful.
function usesSizedFields(type: GrowingAreaType) {
  return type === "pot";
}

export function EstimationReviewForm({
  estimationId,
  proposedAreas,
}: {
  estimationId: string;
  proposedAreas: ProposedArea[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => proposedAreas.map((a, i) => toRow(a, `${i}`)));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  let nextKey = rows.length;

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }
  function addRow() {
    setRows((rs) => [...rs, emptyRow(String(nextKey++))]);
  }

  function handleSubmit() {
    setError(null);
    const payload = rows.map((r) => ({
      type: r.type,
      sizeValue: usesSizedFields(r.type) && r.sizeValue ? Number(r.sizeValue) : null,
      sizeUnit: usesSizedFields(r.type) && r.sizeValue ? r.sizeUnit : null,
      widthCm: !usesSizedFields(r.type) && r.widthCm ? Number(r.widthCm) : null,
      lengthCm: !usesSizedFields(r.type) && r.lengthCm ? Number(r.lengthCm) : null,
      depthCm: !usesSizedFields(r.type) && r.type !== "bed" && r.depthCm ? Number(r.depthCm) : null,
    }));
    startTransition(async () => {
      const result = await confirmGrowingAreaProposalsAction(estimationId, payload);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/garden");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Type
              <select
                value={row.type}
                onChange={(e) => updateRow(row.key, { type: e.target.value as GrowingAreaType })}
                className="rounded-md border border-black/15 px-2 py-1.5 text-sm"
              >
                {growingAreaTypeEnum.map((t) => (
                  <option key={t} value={t}>
                    {growingAreaTypeLabels[t]}
                  </option>
                ))}
              </select>
            </label>

            {usesSizedFields(row.type) ? (
              <label className="flex flex-col gap-1 text-xs">
                Size
                <div className="flex gap-1">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="e.g. 25"
                    value={row.sizeValue}
                    onChange={(e) => updateRow(row.key, { sizeValue: e.target.value })}
                    className="w-20 rounded-md border border-black/15 px-2 py-1.5 text-sm"
                  />
                  <select
                    value={row.sizeUnit}
                    onChange={(e) => updateRow(row.key, { sizeUnit: e.target.value as SizeUnit })}
                    className="rounded-md border border-black/15 px-2 py-1.5 text-sm"
                  >
                    <option value="cm">cm</option>
                    <option value="litres">L</option>
                  </select>
                </div>
              </label>
            ) : (
              <>
                <label className="flex flex-col gap-1 text-xs">
                  Width (cm)
                  <input
                    type="number"
                    min={1}
                    value={row.widthCm}
                    onChange={(e) => updateRow(row.key, { widthCm: e.target.value })}
                    className="w-24 rounded-md border border-black/15 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Length (cm)
                  <input
                    type="number"
                    min={1}
                    value={row.lengthCm}
                    onChange={(e) => updateRow(row.key, { lengthCm: e.target.value })}
                    className="w-24 rounded-md border border-black/15 px-2 py-1.5 text-sm"
                  />
                </label>
                {row.type !== "bed" && (
                  <label className="flex flex-col gap-1 text-xs">
                    Depth (cm)
                    <input
                      type="number"
                      min={1}
                      value={row.depthCm}
                      onChange={(e) => updateRow(row.key, { depthCm: e.target.value })}
                      className="w-24 rounded-md border border-black/15 px-2 py-1.5 text-sm"
                    />
                  </label>
                )}
              </>
            )}

            <button
              type="button"
              onClick={() => removeRow(row.key)}
              className="rounded-md border border-black/15 px-2 py-1.5 text-xs hover:bg-black/5"
            >
              Remove
            </button>
          </div>

          {row.description && (
            <p className="text-xs text-(--text-muted)">
              {row.description}
              {row.confidence !== null && (
                <span className={row.confidence < 0.4 ? "ml-2 text-(--color-terracotta)" : "ml-2"}>
                  · {row.confidence < 0.4 ? "low confidence — check this" : `${Math.round(row.confidence * 100)}% confidence`}
                </span>
              )}
            </p>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="self-start text-sm text-(--brand-primary) underline"
      >
        + Add an area manually
      </button>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending || rows.length === 0}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
      >
        {pending ? "Adding…" : `Add ${rows.length} ${rows.length === 1 ? "area" : "areas"} to my garden`}
      </button>
    </div>
  );
}
