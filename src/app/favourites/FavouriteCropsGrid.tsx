"use client";

import { useState } from "react";
import { setCropPreferenceAction } from "@/lib/actions/crops";

type Crop = { id: string; name: string; emoji: string; category: string; liked: boolean };

export function FavouriteCropsGrid({ crops }: { crops: Crop[] }) {
  const [likedById, setLikedById] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(crops.map((c) => [c.id, c.liked])),
  );
  const [pending, setPending] = useState<string | null>(null);

  async function toggle(cropId: string) {
    const next = !likedById[cropId];
    setLikedById((prev) => ({ ...prev, [cropId]: next }));
    setPending(cropId);
    try {
      await setCropPreferenceAction(cropId, next);
    } catch {
      setLikedById((prev) => ({ ...prev, [cropId]: !next }));
    } finally {
      setPending(null);
    }
  }

  const likedCount = Object.values(likedById).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-(--text-muted)">{likedCount} favourited</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {crops.map((crop) => {
          const liked = likedById[crop.id];
          return (
            <button
              key={crop.id}
              type="button"
              onClick={() => toggle(crop.id)}
              disabled={pending === crop.id}
              aria-pressed={liked}
              aria-label={liked ? `Remove ${crop.name} from favourites` : `Add ${crop.name} to favourites`}
              className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center disabled:opacity-60 ${
                liked
                  ? "border-(--brand-primary) bg-(--brand-primary)/10"
                  : "border-black/10 bg-white hover:border-(--brand-primary)/40"
              }`}
            >
              <span className="text-3xl" aria-hidden>
                {crop.emoji}
              </span>
              <span className="text-sm font-medium">{crop.name}</span>
              <span aria-hidden className={liked ? "text-lg text-(--brand-primary)" : "text-lg text-black/20"}>
                {liked ? "♥" : "♡"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
