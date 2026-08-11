"use client";

import { useActionState, useState } from "react";
import {
  addShoppingItemAction,
  toggleShoppingItemAction,
  deleteShoppingItemAction,
  type AddShoppingItemState,
} from "@/lib/actions/shopping";
import { LeafAccent } from "@/components/LeafAccent";
import { EquipmentIcon } from "@/components/icons";
import { groupShoppingItems } from "@/lib/shopping/grouping";

type PartnerLink = { label: string; url: string };

type Item = {
  id: string;
  cropId: string | null;
  cropName: string | null;
  cropEmoji: string | null;
  equipmentTypeId: string | null;
  equipmentTypeName: string | null;
  freeText: string | null;
  quantityLabel: string;
  status: "pending" | "purchased";
  source: "manual" | "ai";
  partnerLink: PartnerLink | null;
};

type CropOption = { id: string; name: string; emoji: string; partnerLink: PartnerLink | null };
type EquipmentOption = { id: string; name: string; partnerLink: PartnerLink | null };

const initialState: AddShoppingItemState = {};

// Plain-text version — for aria-label/alt-text contexts, which can't render
// the icon markup itemLabel() below uses for on-screen display.
function itemLabelText(item: Item) {
  if (item.cropId) return `${item.cropEmoji ?? ""} ${item.cropName}`.trim();
  if (item.equipmentTypeId) return item.equipmentTypeName ?? "";
  return item.freeText ?? "";
}

function itemLabel(item: Item) {
  if (item.cropId) return `${item.cropEmoji ?? ""} ${item.cropName}`.trim();
  if (item.equipmentTypeId) {
    return (
      <span className="inline-flex items-center gap-1">
        <EquipmentIcon className="h-3.5 w-3.5 shrink-0 text-(--text-muted)" />
        {item.equipmentTypeName}
      </span>
    );
  }
  return item.freeText;
}

// Same crop/equipment/custom item, still the same status, listed more than
// once — combined into one card acting on every underlying row together,
// same "group rows, act on all their ids" shape grow-plan recommendation
// cards already use. Different statuses deliberately never merge: checking
// off one shouldn't silently also check off a still-needed duplicate.
// groupShoppingItems() itself is shared with dashboard/page.tsx's shopping-
// list preview card — see src/lib/shopping/grouping.ts.
type Group = ReturnType<typeof groupShoppingItems<Item>>[number];

export function ShoppingListView({
  items,
  crops,
  equipmentTypes,
}: {
  items: Item[];
  crops: CropOption[];
  equipmentTypes: EquipmentOption[];
}) {
  const [itemList, setItemList] = useState(items);
  const [mode, setMode] = useState<"crop" | "equipment" | "custom">("crop");
  const [state, formAction] = useActionState(async (prev: AddShoppingItemState, formData: FormData) => {
    const result = await addShoppingItemAction(prev, formData);
    if (result.item) {
      const crop = crops.find((c) => c.id === result.item!.cropId);
      const equipmentType = equipmentTypes.find((t) => t.id === result.item!.equipmentTypeId);
      setItemList((items) => [
        ...items,
        {
          id: result.item!.id,
          cropId: result.item!.cropId,
          cropName: crop?.name ?? null,
          cropEmoji: crop?.emoji ?? null,
          equipmentTypeId: result.item!.equipmentTypeId,
          equipmentTypeName: equipmentType?.name ?? null,
          freeText: result.item!.freeText,
          quantityLabel: result.item!.quantityLabel,
          status: "pending",
          source: "manual",
          partnerLink: crop?.partnerLink ?? equipmentType?.partnerLink ?? null,
        },
      ]);
    }
    return result;
  }, initialState);

  async function handleToggle(group: Group) {
    const itemIds = group.items.map((i) => i.id);
    const purchased = group.items[0].status !== "purchased";
    setItemList((items) =>
      items.map((i) => (itemIds.includes(i.id) ? { ...i, status: purchased ? "purchased" : "pending" } : i)),
    );
    await toggleShoppingItemAction(itemIds, purchased);
  }

  async function handleDelete(group: Group) {
    const itemIds = group.items.map((i) => i.id);
    setItemList((items) => items.filter((i) => !itemIds.includes(i.id)));
    await deleteShoppingItemAction(itemIds);
  }

  const pendingGroups = groupShoppingItems(itemList.filter((i) => i.status === "pending"));
  const purchasedGroups = groupShoppingItems(itemList.filter((i) => i.status === "purchased"));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        {itemList.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
            <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
            <p className="text-sm text-(--text-muted)">Your list is empty.</p>
          </div>
        )}
        {[...pendingGroups, ...purchasedGroups].map((group) => {
          const item = group.items[0];
          const anyAi = group.items.some((i) => i.source === "ai");
          return (
            <div
              key={group.key}
              className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 shadow-card"
            >
              <label className="flex flex-1 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.status === "purchased"}
                  onChange={() => handleToggle(group)}
                  className="accent-(--brand-primary)"
                />
                <span className={item.status === "purchased" ? "line-through text-(--text-muted)" : ""}>
                  {itemLabel(item)} · {group.quantitySummary}
                </span>
                {anyAi && (
                  <span className="rounded-full bg-(--brand-secondary)/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    AI
                  </span>
                )}
              </label>
              {item.partnerLink && (
                <a
                  href={item.partnerLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs text-(--brand-primary) underline"
                >
                  {item.partnerLink.label}
                </a>
              )}
              <button
                type="button"
                onClick={() => handleDelete(group)}
                className="text-xs text-(--text-muted) hover:text-red-700"
                aria-label={`Delete ${itemLabelText(item)}`}
              >
                Delete
              </button>
            </div>
          );
        })}
      </section>

      <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card">
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("crop")}
            className={`rounded-full px-3 py-1 transition ${mode === "crop" ? "bg-(--brand-primary) text-white shadow-button" : "bg-black/5 text-(--text-muted) hover:bg-black/10"}`}
          >
            From catalog
          </button>
          <button
            type="button"
            onClick={() => setMode("equipment")}
            className={`rounded-full px-3 py-1 transition ${mode === "equipment" ? "bg-(--brand-primary) text-white shadow-button" : "bg-black/5 text-(--text-muted) hover:bg-black/10"}`}
          >
            Equipment
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`rounded-full px-3 py-1 transition ${mode === "custom" ? "bg-(--brand-primary) text-white shadow-button" : "bg-black/5 text-(--text-muted) hover:bg-black/10"}`}
          >
            Custom item
          </button>
        </div>

        {mode === "crop" && (
          <select name="cropId" required className="rounded-md border border-black/15 px-3 py-2 text-sm">
            {crops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        )}
        {mode === "equipment" && (
          <select name="equipmentTypeId" required className="rounded-md border border-black/15 px-3 py-2 text-sm">
            {equipmentTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {mode === "custom" && (
          <input
            name="freeText"
            type="text"
            required
            placeholder="e.g. Bamboo canes"
            className="rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        )}
        {/* Each mode must zero out both sibling fields, not just the one other mode. */}
        {mode !== "crop" && <input type="hidden" name="cropId" value="" readOnly />}
        {mode !== "equipment" && <input type="hidden" name="equipmentTypeId" value="" readOnly />}
        {mode !== "custom" && <input type="hidden" name="freeText" value="" readOnly />}

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
            className="rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
          >
            Add
          </button>
        </div>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      </form>
    </div>
  );
}
