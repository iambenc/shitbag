"use client";

import { useActionState, useState } from "react";
import {
  updateEquipmentTypeAction,
  deleteEquipmentTypeAction,
  createPartnerLinkAction,
  deletePartnerLinkAction,
  type ActionState,
} from "@/lib/actions/admin";

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

export function EquipmentTypeRow({ type, links }: { type: EquipmentType; links: PartnerLink[] }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updatePending] = useActionState(updateEquipmentTypeAction, initialState);
  const [linkState, linkAction, linkPending] = useActionState(createPartnerLinkAction, initialState);

  async function handleDelete() {
    const message =
      type.usageCount > 0
        ? `${type.usageCount} gardener(s) currently have this in their inventory — deleting it removes it from their records too. Delete anyway?`
        : "Delete this equipment type?";
    if (!window.confirm(message)) return;
    await deleteEquipmentTypeAction(type.id);
  }

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      {editing ? (
        <form action={updateAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={type.id} />
          <div className="flex flex-wrap gap-3">
            <input
              name="name"
              defaultValue={type.name}
              required
              className="rounded-md border border-black/15 px-3 py-2 text-sm"
            />
            <select
              name="category"
              defaultValue={type.category}
              className="rounded-md border border-black/15 px-3 py-2 text-sm"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              name="sortOrder"
              type="number"
              defaultValue={type.sortOrder}
              className="w-20 rounded-md border border-black/15 px-3 py-2 text-sm"
            />
          </div>
          {updateState.error && <p className="text-sm text-red-700">{updateState.error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={updatePending}
              className="rounded-full bg-(--brand-primary) px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {updatePending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm text-[#1f2a1f]/60 underline">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">
              {type.name} <span className="text-xs text-[#1f2a1f]/50">({type.slug})</span>
            </p>
            <p className="text-xs text-[#1f2a1f]/50">
              {type.category} · sort {type.sortOrder} · {type.usageCount} in gardener inventories
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <button type="button" onClick={() => setEditing(true)} className="text-(--brand-primary) underline">
              Edit
            </button>
            <button type="button" onClick={handleDelete} className="text-[#1f2a1f]/50 hover:text-red-700">
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-black/10 pt-3">
        <p className="text-xs font-medium text-[#1f2a1f]/60">Partner links</p>
        <ul className="mt-2 flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between text-sm">
              <a href={link.url} target="_blank" rel="noreferrer" className="text-(--brand-primary) underline">
                {link.label}
              </a>
              <button
                type="button"
                onClick={() => deletePartnerLinkAction(link.id)}
                className="text-xs text-[#1f2a1f]/50 hover:text-red-700"
              >
                Remove
              </button>
            </li>
          ))}
          {links.length === 0 && <li className="text-sm text-[#1f2a1f]/50">No partner links yet.</li>}
        </ul>
        <form action={linkAction} className="mt-2 flex flex-wrap gap-2">
          <input type="hidden" name="equipmentTypeId" value={type.id} />
          <input name="label" placeholder="Label" required className="rounded-md border border-black/15 px-2 py-1 text-sm" />
          <input
            name="url"
            type="url"
            placeholder="https://..."
            required
            className="rounded-md border border-black/15 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={linkPending}
            className="rounded-full border border-(--brand-primary)/30 px-3 py-1 text-xs hover:bg-(--brand-primary)/10 disabled:opacity-60"
          >
            {linkPending ? "Adding…" : "Add link"}
          </button>
        </form>
        {linkState.error && <p className="mt-1 text-sm text-red-700">{linkState.error}</p>}
      </div>
    </div>
  );
}
