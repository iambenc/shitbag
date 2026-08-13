"use client";

import { useActionState, useState } from "react";
import type { EquipmentState } from "@/lib/garden/equipmentRows";
import type { EquipmentCategory, SizeUnit } from "@/db/schema";
import { SLUG_TO_GROWING_AREA_TYPE } from "@/lib/garden/equipmentMapping";

type EquipmentTypeInfo = {
  id: string;
  slug: string;
  name: string;
  category: EquipmentCategory;
  partnerLink: { label: string; url: string } | null;
};

type OwnedRowInput = {
  id: string;
  equipmentTypeId: string;
  quantity: number;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
};

type Row = {
  id: string;
  equipmentTypeId: string;
  quantity: number;
  sizeValue: string;
  sizeUnit: SizeUnit;
  widthCm: string;
  lengthCm: string;
  depthCm: string;
};

const initialState: EquipmentState = {};

function emptyRow(equipmentTypeId: string): Row {
  return {
    id: crypto.randomUUID(),
    equipmentTypeId,
    quantity: 1,
    sizeValue: "",
    sizeUnit: "cm",
    widthCm: "",
    lengthCm: "",
    depthCm: "",
  };
}

export function EquipmentPicker({
  types,
  initialRows,
  action,
  submitLabel = "Continue",
  pendingLabel = "Saving…",
}: {
  types: EquipmentTypeInfo[];
  initialRows: OwnedRowInput[];
  action: (prevState: EquipmentState, formData: FormData) => Promise<EquipmentState>;
  submitLabel?: string;
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows.map((r) => ({
      id: r.id,
      equipmentTypeId: r.equipmentTypeId,
      quantity: r.quantity,
      sizeValue: r.sizeValue?.toString() ?? "",
      // Every pre-existing row needs an explicit unit, not just new ones —
      // relying on the <select>'s default option would be fragile.
      sizeUnit: r.sizeUnit ?? "cm",
      widthCm: r.widthCm?.toString() ?? "",
      lengthCm: r.lengthCm?.toString() ?? "",
      depthCm: r.depthCm?.toString() ?? "",
    })),
  );

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow(equipmentTypeId: string) {
    setRows((rs) => [...rs, emptyRow(equipmentTypeId)]);
  }
  function removeRow(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
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

  // Planting equipment (pots/trays/planters/beds) automatically becomes
  // growing space when added — see applyEquipmentRows.ts — so it's kept
  // visually separate from tools (watering can, secateurs, etc.), which are
  // just "things you own," never something you plant into. Same
  // SLUG_TO_GROWING_AREA_TYPE map that already drives the auto-placement
  // logic server-side, not a redundant client-side list.
  const growingSpaceTypes = types.filter((t) => t.slug in SLUG_TO_GROWING_AREA_TYPE);
  const toolTypes = types.filter((t) => !(t.slug in SLUG_TO_GROWING_AREA_TYPE));

  function renderTypeFieldset(type: EquipmentTypeInfo) {
    return (
      <fieldset
        key={type.id}
        className="flex flex-col gap-2 border-b border-black/10 pb-6 last:border-0"
      >
        <legend className="text-sm font-medium">
          {type.name}
          {/* Only while not yet owned — once the user has it, a "buy this"
              link isn't relevant anymore. Every type (owned or not) already
              gets its own fieldset here, in its correct Planting
              equipment/Garden tools section, so this is the only place the
              link needs to appear — no separate not-owned summary block. */}
          {type.partnerLink && !ownedTypeIds.has(type.id) && (
            <>
              {" — "}
              <a
                href={type.partnerLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-normal text-(--brand-primary) underline"
              >
                {type.partnerLink.label}
              </a>
            </>
          )}
        </legend>

        {type.category === "count" && (
          <div className="flex items-center gap-3 text-sm">
            Quantity
            <button
              type="button"
              onClick={() => setCountQuantity(type.id, Math.max(0, countQuantity(type.id) - 1))}
              disabled={countQuantity(type.id) <= 0}
              aria-label={`Remove one ${type.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 hover:bg-black/10 active:scale-95 transition disabled:opacity-40"
            >
              –
            </button>
            <span className="w-6 text-center">{countQuantity(type.id)}</span>
            <button
              type="button"
              onClick={() => setCountQuantity(type.id, Math.min(99, countQuantity(type.id) + 1))}
              disabled={countQuantity(type.id) >= 99}
              aria-label={`Add one ${type.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-(--brand-primary) text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-40"
            >
              +
            </button>
          </div>
        )}

        {type.category !== "count" &&
          rows
            .filter((r) => r.equipmentTypeId === type.id)
            .map((row) => (
              <div key={row.id} className="flex flex-wrap items-end gap-2">
                {type.category === "sized" && (
                  <label className="flex flex-col gap-1 text-xs">
                    Size
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="e.g. 20"
                        value={row.sizeValue}
                        onChange={(e) => updateRow(row.id, { sizeValue: e.target.value })}
                        className="w-20 rounded-md border border-black/15 px-2 py-1.5 text-sm"
                      />
                      <select
                        value={row.sizeUnit}
                        onChange={(e) => updateRow(row.id, { sizeUnit: e.target.value as SizeUnit })}
                        className="rounded-md border border-black/15 px-2 py-1.5 text-sm"
                      >
                        <option value="cm">cm</option>
                        <option value="litres">L</option>
                      </select>
                    </div>
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
                        onChange={(e) => updateRow(row.id, { widthCm: e.target.value })}
                        className="w-24 rounded-md border border-black/15 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      Length (cm)
                      <input
                        type="number"
                        min={1}
                        value={row.lengthCm}
                        onChange={(e) => updateRow(row.id, { lengthCm: e.target.value })}
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
                          onChange={(e) => updateRow(row.id, { depthCm: e.target.value })}
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
                      updateRow(row.id, { quantity: Math.max(1, Number(e.target.value)) })
                    }
                    className="w-20 rounded-md border border-black/15 px-2 py-1.5 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(row.id)}
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
    );
  }

  const serializedRows = JSON.stringify(
    rows
      .filter((r) => r.quantity > 0)
      .map((r) => ({
        id: r.id,
        equipmentTypeId: r.equipmentTypeId,
        quantity: r.quantity,
        sizeValue: r.sizeValue ? Number(r.sizeValue) : null,
        sizeUnit: r.sizeValue ? r.sizeUnit : null,
        widthCm: r.widthCm ? Number(r.widthCm) : null,
        lengthCm: r.lengthCm ? Number(r.lengthCm) : null,
        depthCm: r.depthCm ? Number(r.depthCm) : null,
      })),
  );

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="rows" value={serializedRows} readOnly />

      {growingSpaceTypes.length > 0 && (
        <div className="flex flex-col gap-6">
          <div>
            <p className="font-display text-lg font-semibold">Planting equipment</p>
            <p className="text-sm text-(--text-muted)">
              Pots, trays, planters and beds — these automatically become ready-to-grow-in space
              when you add them.
            </p>
          </div>
          {growingSpaceTypes.map(renderTypeFieldset)}
        </div>
      )}

      {toolTypes.length > 0 && (
        <div className="flex flex-col gap-6">
          <div>
            <p className="font-display text-lg font-semibold">Garden tools</p>
            <p className="text-sm text-(--text-muted)">
              Everything you use in the garden, separate from the growing space itself.
            </p>
          </div>
          {toolTypes.map(renderTypeFieldset)}
        </div>
      )}

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.success && <p className="text-sm text-green-700">Saved.</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
      >
        {pending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
