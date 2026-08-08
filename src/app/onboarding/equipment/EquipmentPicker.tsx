"use client";

import { useActionState, useState } from "react";
import { saveEquipmentAction, type EquipmentState } from "@/lib/actions/onboarding/equipment";
import type { EquipmentCategory } from "@/db/schema";

type EquipmentTypeInfo = {
  id: string;
  slug: string;
  name: string;
  category: EquipmentCategory;
  partnerLink: { label: string; url: string } | null;
};

type OwnedRowInput = {
  equipmentTypeId: string;
  quantity: number;
  sizeLabel: string | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
};

type Row = {
  key: string;
  equipmentTypeId: string;
  quantity: number;
  sizeLabel: string;
  widthCm: string;
  lengthCm: string;
  depthCm: string;
};

const initialState: EquipmentState = {};

function emptyRow(equipmentTypeId: string): Row {
  return {
    key: `${equipmentTypeId}-${Math.random().toString(36).slice(2)}`,
    equipmentTypeId,
    quantity: 1,
    sizeLabel: "",
    widthCm: "",
    lengthCm: "",
    depthCm: "",
  };
}

export function EquipmentPicker({
  types,
  initialRows,
}: {
  types: EquipmentTypeInfo[];
  initialRows: OwnedRowInput[];
}) {
  const [state, formAction, pending] = useActionState(saveEquipmentAction, initialState);
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows.map((r) => ({
      key: `${r.equipmentTypeId}-${Math.random().toString(36).slice(2)}`,
      equipmentTypeId: r.equipmentTypeId,
      quantity: r.quantity,
      sizeLabel: r.sizeLabel ?? "",
      widthCm: r.widthCm?.toString() ?? "",
      lengthCm: r.lengthCm?.toString() ?? "",
      depthCm: r.depthCm?.toString() ?? "",
    })),
  );

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow(equipmentTypeId: string) {
    setRows((rs) => [...rs, emptyRow(equipmentTypeId)]);
  }
  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }
  function countQuantity(typeId: string) {
    return rows.find((r) => r.equipmentTypeId === typeId)?.quantity ?? 0;
  }
  function setCountQuantity(typeId: string, quantity: number) {
    setRows((rs) => {
      const existing = rs.find((r) => r.equipmentTypeId === typeId);
      if (existing) return rs.map((r) => (r === existing ? { ...r, quantity } : r));
      return [...rs, { ...emptyRow(typeId), quantity }];
    });
  }

  const ownedTypeIds = new Set(rows.filter((r) => r.quantity > 0).map((r) => r.equipmentTypeId));
  const notOwned = types.filter((t) => !ownedTypeIds.has(t.id));

  const serializedRows = JSON.stringify(
    rows
      .filter((r) => r.quantity > 0)
      .map((r) => ({
        equipmentTypeId: r.equipmentTypeId,
        quantity: r.quantity,
        sizeLabel: r.sizeLabel || null,
        widthCm: r.widthCm ? Number(r.widthCm) : null,
        lengthCm: r.lengthCm ? Number(r.lengthCm) : null,
        depthCm: r.depthCm ? Number(r.depthCm) : null,
      })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="rows" value={serializedRows} readOnly />

      {types.map((type) => (
        <fieldset
          key={type.id}
          className="flex flex-col gap-2 border-b border-black/10 pb-6 last:border-0"
        >
          <legend className="text-sm font-medium">{type.name}</legend>

          {type.category === "count" && (
            <label className="flex items-center gap-3 text-sm">
              Quantity
              <input
                type="number"
                min={0}
                max={99}
                value={countQuantity(type.id)}
                onChange={(e) => setCountQuantity(type.id, Math.max(0, Number(e.target.value)))}
                className="w-24 rounded-md border border-black/15 px-3 py-1.5"
              />
            </label>
          )}

          {type.category !== "count" &&
            rows
              .filter((r) => r.equipmentTypeId === type.id)
              .map((row) => (
                <div key={row.key} className="flex flex-wrap items-end gap-2">
                  {type.category === "sized" && (
                    <label className="flex flex-col gap-1 text-xs">
                      Size
                      <input
                        type="text"
                        placeholder="e.g. 20cm"
                        value={row.sizeLabel}
                        onChange={(e) => updateRow(row.key, { sizeLabel: e.target.value })}
                        className="w-28 rounded-md border border-black/15 px-2 py-1.5 text-sm"
                      />
                    </label>
                  )}
                  {type.category === "dimensions" && (
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
                      {type.slug !== "garden-beds" && (
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
                  <label className="flex flex-col gap-1 text-xs">
                    Quantity
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={row.quantity}
                      onChange={(e) =>
                        updateRow(row.key, { quantity: Math.max(1, Number(e.target.value)) })
                      }
                      className="w-20 rounded-md border border-black/15 px-2 py-1.5 text-sm"
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

          {type.category !== "count" && (
            <button
              type="button"
              onClick={() => addRow(type.id)}
              className="self-start text-sm text-(--brand-primary) underline"
            >
              + Add {type.name.toLowerCase()}
            </button>
          )}
        </fieldset>
      ))}

      {notOwned.length > 0 && (
        <div className="rounded-lg bg-black/5 p-4 text-sm">
          <p className="font-medium">You might also want</p>
          <ul className="mt-2 flex flex-col gap-1">
            {notOwned.map((t) => (
              <li key={t.id}>
                {t.name}
                {t.partnerLink && (
                  <>
                    {" — "}
                    <a
                      href={t.partnerLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-(--brand-primary) underline"
                    >
                      {t.partnerLink.label}
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
