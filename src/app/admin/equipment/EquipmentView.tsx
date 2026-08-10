"use client";

import { useActionState } from "react";
import { createEquipmentTypeAction, type ActionState } from "@/lib/actions/admin";
import { EquipmentTypeRow } from "./EquipmentTypeRow";

const CATEGORY_OPTIONS = ["count", "sized", "dimensions"] as const;
const initialState: ActionState = {};

type EquipmentType = {
  id: string;
  slug: string;
  name: string;
  category: string;
  sortOrder: number;
  usageCount: number;
};
type PartnerLink = { id: string; equipmentTypeId: string; label: string; url: string };

export function EquipmentView({ types, links }: { types: EquipmentType[]; links: PartnerLink[] }) {
  const [state, formAction, pending] = useActionState(createEquipmentTypeAction, initialState);

  return (
    <div className="flex flex-col gap-6">
      {types.map((type) => (
        <EquipmentTypeRow
          key={type.id}
          type={type}
          links={links.filter((l) => l.equipmentTypeId === type.id)}
        />
      ))}

      <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-dashed border-black/20 p-4">
        <p className="text-sm font-medium">Add equipment type</p>
        <div className="flex flex-wrap gap-3">
          <input name="slug" placeholder="slug" required className="rounded-md border border-black/15 px-3 py-2 text-sm" />
          <input name="name" placeholder="Name" required className="rounded-md border border-black/15 px-3 py-2 text-sm" />
          <select name="category" defaultValue="count" className="rounded-md border border-black/15 px-3 py-2 text-sm">
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            name="sortOrder"
            type="number"
            defaultValue={types.length}
            className="w-20 rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        </div>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white hover:brightness-90 active:scale-95 transition disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add type"}
        </button>
      </form>
    </div>
  );
}
