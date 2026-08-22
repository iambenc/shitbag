"use client";

import { useActionState, useState } from "react";
import { addHarvestAction, deleteHarvestAction, type AddHarvestState } from "@/lib/actions/harvests";
import { setPhotoVisibilityAction } from "@/lib/actions/photos";
import { EyeIcon } from "@/components/icons";
import type { PhotoVisibility } from "@/db/schema";

type Harvest = {
  id: string;
  cropId: string;
  cropName: string;
  cropEmoji: string;
  varietyName: string | null;
  quantity: number;
  unit: string;
  harvestedAt: string;
  notes: string | null;
  photoId: string | null;
  photoUrl: string | null;
  photoVisibility: PhotoVisibility | null;
};

type VarietyOption = { id: string; name: string };
type CropOption = { id: string; name: string; emoji: string; varieties: VarietyOption[] };

const initialState: AddHarvestState = {};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Crop select drives which varieties the dependent variety select offers —
// only ever picks from crop_varieties rows that already exist (no AI
// resolution here, unlike /seeds' free-text variety field), so a plain
// dependent <select> is enough.
function CropAndVarietyFields({ crops }: { crops: CropOption[] }) {
  const [selectedCropId, setSelectedCropId] = useState(crops[0]?.id ?? "");
  const selectedCrop = crops.find((c) => c.id === selectedCropId);

  return (
    <>
      <select
        name="cropId"
        required
        value={selectedCropId}
        onChange={(e) => setSelectedCropId(e.target.value)}
        className="rounded-md border border-black/15 px-3 py-2 text-sm"
      >
        {crops.map((c) => (
          <option key={c.id} value={c.id}>
            {c.emoji} {c.name}
          </option>
        ))}
      </select>
      {selectedCrop && selectedCrop.varieties.length > 0 && (
        <select name="varietyId" className="rounded-md border border-black/15 px-3 py-2 text-sm">
          <option value="">No specific variety</option>
          {selectedCrop.varieties.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      )}
    </>
  );
}

export function HarvestsView({ harvests, crops }: { harvests: Harvest[]; crops: CropOption[] }) {
  const [list, setList] = useState(harvests);
  // CropAndVarietyFields' crop select is controlled (needed to drive the
  // dependent variety options), so — unlike the plain quantity/unit/date
  // inputs — it won't reset itself via React 19's automatic uncontrolled-
  // field form reset after a successful submit. Remounting it via a
  // changing `key` on each success resets it back to the first crop, no
  // variety selected.
  const [resetToken, setResetToken] = useState(0);
  const [state, formAction] = useActionState(async (prev: AddHarvestState, formData: FormData) => {
    const result = await addHarvestAction(prev, formData);
    if (result.harvest) {
      const crop = crops.find((c) => c.id === result.harvest!.cropId);
      const variety = crop?.varieties.find((v) => v.id === result.harvest!.varietyId);
      setList((hs) => [
        {
          id: result.harvest!.id,
          cropId: result.harvest!.cropId,
          cropName: crop?.name ?? "",
          cropEmoji: crop?.emoji ?? "",
          varietyName: variety?.name ?? null,
          quantity: result.harvest!.quantity,
          unit: result.harvest!.unit,
          harvestedAt: result.harvest!.harvestedAt,
          notes: result.harvest!.notes,
          photoId: result.harvest!.photoId,
          photoUrl: result.harvest!.photoUrl,
          photoVisibility: result.harvest!.photoVisibility,
        },
        ...hs,
      ]);
      setResetToken((t) => t + 1);
    }
    return result;
  }, initialState);

  async function handleDelete(id: string) {
    setList((hs) => hs.filter((h) => h.id !== id));
    await deleteHarvestAction(id);
  }

  async function handleToggleVisibility(harvest: Harvest) {
    if (!harvest.photoId || !harvest.photoVisibility) return;
    const visibility = harvest.photoVisibility === "private" ? "shared_tenant" : "private";
    setList((hs) => hs.map((h) => (h.id === harvest.id ? { ...h, photoVisibility: visibility } : h)));
    await setPhotoVisibilityAction(harvest.photoId, visibility);
  }

  return (
    <div className="flex flex-col gap-8">
      {crops.length === 0 ? (
        <div className="rounded-lg border border-black/10 bg-(--surface-tint) p-4 text-sm text-(--text-muted)">
          Nothing to log a harvest for yet — once a grow plan recommendation has actually been
          planted, its crop will show up here.
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card">
          <div className="flex flex-wrap gap-2">
            <CropAndVarietyFields key={resetToken} crops={crops} />
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
          <div className="flex flex-wrap items-center gap-3">
            <input
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-(--brand-primary) file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:opacity-90"
            />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input type="radio" name="visibility" value="private" defaultChecked className="accent-(--brand-primary)" /> Just me
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="visibility" value="shared_tenant" className="accent-(--brand-primary)" /> Shared with everyone here
              </label>
            </div>
          </div>
          <button
            type="submit"
            className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
          >
            Log harvest
          </button>
          {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        </form>
      )}

      <section className="flex flex-col gap-2">
        {list.length === 0 && <p className="text-sm text-(--text-muted)">No harvests logged yet.</p>}
        {list.map((h) => (
          <div
            key={h.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 shadow-card text-sm"
          >
            <div className="flex items-center gap-3">
              {h.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- locally-stored user upload, not an optimizable static asset
                <img
                  src={h.photoUrl}
                  alt={`${h.cropName} harvest`}
                  className="h-12 w-12 shrink-0 rounded object-cover"
                />
              )}
              <div>
                <span>
                  {h.cropEmoji} {h.cropName}
                  {h.varietyName ? ` (${h.varietyName})` : ""} — {h.quantity}
                  {h.unit} on {h.harvestedAt}
                </span>
                {h.notes && <p className="text-xs text-(--text-muted)">{h.notes}</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {h.photoId && h.photoVisibility && (
                <button
                  type="button"
                  onClick={() => handleToggleVisibility(h)}
                  className="flex items-center gap-1 text-xs text-(--text-muted) hover:text-(--brand-primary)"
                  aria-label={h.photoVisibility === "private" ? "Share this harvest photo" : "Make this harvest photo private"}
                  title={h.photoVisibility === "private" ? "Share" : "Make private"}
                >
                  <EyeIcon className="h-3.5 w-3.5" />
                  {h.photoVisibility === "private" ? "Private" : "Shared"}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(h.id)}
                className="text-xs text-(--text-muted) hover:text-red-700"
                aria-label={`Delete harvest of ${h.cropName}`}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
