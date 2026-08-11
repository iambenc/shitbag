// Shared by ShoppingListView.tsx (the full list) and dashboard/page.tsx's
// preview card — both render shopping_list_items and both need the same
// "same crop/equipment/custom item + same status, listed more than once"
// combining behavior. Kept as one function rather than duplicated in both
// places specifically because the two showing *different* grouping
// behavior would itself be a confusing inconsistency, unlike this
// codebase's usual "duplicate rather than risk shared code" calls (e.g.
// Inngest gather-context steps), which apply to complex multi-step logic
// with only one real reuse — this is a small, pure function with two real
// callers that must never drift apart.
export type GroupableShoppingItem = {
  id: string;
  cropId: string | null;
  equipmentTypeId: string | null;
  freeText: string | null;
  quantityLabel: string;
  status: string;
};

export type ShoppingItemGroup<T extends GroupableShoppingItem> = {
  key: string;
  // Every grouped instance, not just a summary — callers derive whatever
  // else they need (an "AI" badge if any instance is ai-sourced, a partner
  // link, etc.) from this rather than the shared function guessing at
  // every possible caller's needs.
  items: T[];
  quantitySummary: string;
};

function groupKey(item: GroupableShoppingItem): string {
  return `${item.cropId ?? ""}|${item.equipmentTypeId ?? ""}|${(item.freeText ?? "").trim().toLowerCase()}|${item.status}`;
}

// "1 packet" + "1 packet" -> {amount: 1, unit: "packet"} twice, not "1 packet
// ×2" — but only when there's an actual number to add up front ("500g" ->
// {500, "g"}); a label with no leading number ("a packet") can't be summed,
// so it falls through to the old count/join behaviour below.
function parseQuantity(label: string): { amount: number; unit: string } | null {
  const match = label.trim().match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
  if (!match) return null;
  return { amount: Number(match[1]), unit: match[2].trim() };
}

// Loose singular key for comparing "packet" against "packets" — imperfect
// for irregular plurals (e.g. "boxes"), but good enough to unify the common
// case of a user typing the singular once and the plural another time,
// without needing a real pluralization library for a free-text field.
function unitKey(unit: string): string {
  const lower = unit.toLowerCase();
  return lower.endsWith("s") && lower.length > 1 ? lower.slice(0, -1) : lower;
}

const UNIT_ABBREVIATIONS = /^(kg|g|mg|l|ml|cl|cm|mm|m)$/i;

function pluralize(unit: string, amount: number): string {
  if (amount === 1 || UNIT_ABBREVIATIONS.test(unit)) return unit;
  if (/[sxz]$|[cs]h$/i.test(unit)) return `${unit}es`;
  if (/[^aeiou]y$/i.test(unit)) return `${unit.slice(0, -1)}ies`;
  return `${unit}s`;
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : String(Math.round(amount * 100) / 100);
}

// quantityLabel is free text ("1 packet", "500g") — arithmetic across
// mismatched units would be wrong (can't sum "1 packet" + "500g"), so
// summing only happens when every label in the group parses to a number
// and they all share the same unit; anything else falls back to counting
// identical labels ("1 punnet ×3") and joining distinct ones, rather than
// guessing at a conversion.
function combineQuantityLabels(labels: string[]): string {
  if (labels.length === 1) return labels[0];

  const parsed = labels.map(parseQuantity);
  const first = parsed[0];
  if (first && parsed.every((p) => p && unitKey(p.unit) === unitKey(first.unit))) {
    const total = parsed.reduce((sum, p) => sum + p!.amount, 0);
    // Prefer whichever original unit text reads as singular, so "1 packet"
    // + "1 packet" combines to a clean base word rather than possibly
    // doubling up on an already-plural one a user happened to type.
    const baseUnit = parsed.find((p) => !p!.unit.toLowerCase().endsWith("s"))?.unit ?? first.unit;
    return `${formatAmount(total)} ${pluralize(baseUnit, total)}`;
  }

  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()].map(([label, count]) => (count > 1 ? `${label} ×${count}` : label)).join(" + ");
}

export function groupShoppingItems<T extends GroupableShoppingItem>(items: T[]): ShoppingItemGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = groupKey(item);
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.entries()].map(([key, groupedItems]) => ({
    key,
    items: groupedItems,
    quantitySummary: combineQuantityLabels(groupedItems.map((i) => i.quantityLabel)),
  }));
}
