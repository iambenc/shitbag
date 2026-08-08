"use client";

import { useActionState, useState } from "react";
import {
  addShoppingItemAction,
  toggleShoppingItemAction,
  deleteShoppingItemAction,
  type AddShoppingItemState,
} from "@/lib/actions/shopping";

type Item = {
  id: string;
  cropId: string | null;
  cropName: string | null;
  cropEmoji: string | null;
  freeText: string | null;
  quantityLabel: string;
  status: "pending" | "purchased";
};

type CropOption = { id: string; name: string; emoji: string };

const initialState: AddShoppingItemState = {};

function itemLabel(item: Item) {
  return item.cropId ? `${item.cropEmoji ?? ""} ${item.cropName}`.trim() : item.freeText;
}

export function ShoppingListView({ items, crops }: { items: Item[]; crops: CropOption[] }) {
  const [itemList, setItemList] = useState(items);
  const [mode, setMode] = useState<"crop" | "custom">("crop");
  const [state, formAction] = useActionState(async (prev: AddShoppingItemState, formData: FormData) => {
    const result = await addShoppingItemAction(prev, formData);
    if (result.item) {
      const crop = crops.find((c) => c.id === result.item!.cropId);
      setItemList((items) => [
        ...items,
        {
          id: result.item!.id,
          cropId: result.item!.cropId,
          cropName: crop?.name ?? null,
          cropEmoji: crop?.emoji ?? null,
          freeText: result.item!.freeText,
          quantityLabel: result.item!.quantityLabel,
          status: "pending",
        },
      ]);
    }
    return result;
  }, initialState);

  async function handleToggle(item: Item) {
    const purchased = item.status !== "purchased";
    setItemList((items) =>
      items.map((i) => (i.id === item.id ? { ...i, status: purchased ? "purchased" : "pending" } : i)),
    );
    await toggleShoppingItemAction(item.id, purchased);
  }

  async function handleDelete(itemId: string) {
    setItemList((items) => items.filter((i) => i.id !== itemId));
    await deleteShoppingItemAction(itemId);
  }

  const pending = itemList.filter((i) => i.status === "pending");
  const purchased = itemList.filter((i) => i.status === "purchased");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        {itemList.length === 0 && <p className="text-sm text-[#1f2a1f]/60">Your list is empty.</p>}
        {[...pending, ...purchased].map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3"
          >
            <label className="flex flex-1 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.status === "purchased"}
                onChange={() => handleToggle(item)}
              />
              <span className={item.status === "purchased" ? "line-through text-[#1f2a1f]/50" : ""}>
                {itemLabel(item)} · {item.quantityLabel}
              </span>
            </label>
            <button
              type="button"
              onClick={() => handleDelete(item.id)}
              className="text-xs text-[#1f2a1f]/50 hover:text-red-700"
              aria-label={`Delete ${itemLabel(item)}`}
            >
              Delete
            </button>
          </div>
        ))}
      </section>

      <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4">
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("crop")}
            className={`rounded-full px-3 py-1 ${mode === "crop" ? "bg-(--brand-primary) text-white" : "border border-black/15"}`}
          >
            From catalog
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`rounded-full px-3 py-1 ${mode === "custom" ? "bg-(--brand-primary) text-white" : "border border-black/15"}`}
          >
            Custom item
          </button>
        </div>

        {mode === "crop" ? (
          <select name="cropId" required className="rounded-md border border-black/15 px-3 py-2 text-sm">
            {crops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            name="freeText"
            type="text"
            required
            placeholder="e.g. Bamboo canes"
            className="rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        )}
        {mode === "crop" && <input type="hidden" name="freeText" value="" readOnly />}
        {mode === "custom" && <input type="hidden" name="cropId" value="" readOnly />}

        <div className="flex gap-2">
          <input
            name="quantityLabel"
            type="text"
            required
            placeholder="Quantity, e.g. 1 packet"
            className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-full bg-(--brand-primary) px-4 py-2 text-sm text-white hover:opacity-90"
          >
            Add
          </button>
        </div>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      </form>
    </div>
  );
}
