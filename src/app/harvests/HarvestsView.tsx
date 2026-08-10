"use client";

import { useActionState, useState } from "react";
import { addHarvestAction, deleteHarvestAction, type AddHarvestState } from "@/lib/actions/harvests";

type Harvest = {
  id: string;
  cropId: string;
  cropName: string;
  cropEmoji: string;
  quantity: number;
  unit: string;
  harvestedAt: string;
  notes: string | null;
};

type CropOption = { id: string; name: string; emoji: string };

const initialState: AddHarvestState = {};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function HarvestsView({ harvests, crops }: { harvests: Harvest[]; crops: CropOption[] }) {
  const [list, setList] = useState(harvests);
  const [state, formAction] = useActionState(async (prev: AddHarvestState, formData: FormData) => {
    const result = await addHarvestAction(prev, formData);
    if (result.harvest) {
      const crop = crops.find((c) => c.id === result.harvest!.cropId);
      setList((hs) => [
        {
          id: result.harvest!.id,
          cropId: result.harvest!.cropId,
          cropName: crop?.name ?? "",
          cropEmoji: crop?.emoji ?? "",
          quantity: result.harvest!.quantity,
          unit: result.harvest!.unit,
          harvestedAt: result.harvest!.harvestedAt,
          notes: result.harvest!.notes,
        },
        ...hs,
      ]);
    }
    return result;
  }, initialState);

  async function handleDelete(id: string) {
    setList((hs) => hs.filter((h) => h.id !== id));
    await deleteHarvestAction(id);
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card">
        <div className="flex flex-wrap gap-2">
          <select name="cropId" required className="rounded-md border border-black/15 px-3 py-2 text-sm">
            {crops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <input
            name="quantity"
            type="number"
            min={0}
            step={0.1}
            required
            placeholder="Quantity"
            className="w-28 rounded-md border border-black/15 px-3 py-2 text-sm"
          />
          <input
            name="unit"
            type="text"
            required
            placeholder="kg, pieces…"
            defaultValue="kg"
            className="w-28 rounded-md border border-black/15 px-3 py-2 text-sm"
          />
          <input
            name="harvestedAt"
            type="date"
            required
            defaultValue={todayIso()}
            className="rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        </div>
        <input
          name="notes"
          type="text"
          placeholder="Notes (optional)"
          className="rounded-md border border-black/15 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white hover:brightness-90 active:scale-95 transition"
        >
          Log harvest
        </button>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      </form>

      <section className="flex flex-col gap-2">
        {list.length === 0 && <p className="text-sm text-(--text-muted)">No harvests logged yet.</p>}
        {list.map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 shadow-card text-sm"
          >
            <div>
              <span>
                {h.cropEmoji} {h.cropName} — {h.quantity}
                {h.unit} on {h.harvestedAt}
              </span>
              {h.notes && <p className="text-xs text-(--text-muted)">{h.notes}</p>}
            </div>
            <button
              type="button"
              onClick={() => handleDelete(h.id)}
              className="text-xs text-(--text-muted) hover:text-red-700"
              aria-label={`Delete harvest of ${h.cropName}`}
            >
              Delete
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
