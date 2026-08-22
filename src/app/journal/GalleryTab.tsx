"use client";

import { EyeIcon, TrashIcon } from "@/components/icons";
import { LeafAccent } from "@/components/LeafAccent";
import type { GalleryPhoto } from "./types";

// Today's existing "My Photos" grid, lifted essentially unchanged (same
// hover-reveal actions) — just living under its own "Gallery" tab now
// instead of a "My Photos" pill.
export function GalleryTab({
  photos,
  tenantName,
  paid,
  diagnosingId,
  diagnosesRemainingToday,
  onToggleVisibility,
  onDiagnose,
  onDelete,
}: {
  photos: GalleryPhoto[];
  tenantName: string;
  paid: boolean;
  diagnosingId: string | null;
  diagnosesRemainingToday: number;
  onToggleVisibility: (photo: GalleryPhoto) => void;
  onDiagnose: (photoId: string) => void;
  onDelete: (photoId: string) => void;
}) {
  if (photos.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
        <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
        <p className="text-sm text-(--text-muted)">No photos yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => (
        <div key={photo.id} className="group flex flex-col gap-1 overflow-hidden rounded-lg border border-black/10 bg-white shadow-card">
          <div className="relative aspect-square w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element -- locally-stored user upload, not an optimizable static asset */}
            <img src={photo.url} alt={photo.caption ?? "Garden photo"} className="h-full w-full object-cover" />

            <span
              className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white"
              title={photo.visibility === "private" ? "Only visible to you" : `Shared with everyone in ${tenantName}`}
            >
              <EyeIcon className="h-3 w-3 shrink-0" />
              {photo.visibility === "private" ? "Private" : "Shared"}
            </span>

            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                onClick={() => onToggleVisibility(photo)}
                className="rounded-full bg-white/90 p-2 hover:bg-white active:scale-95 transition"
                aria-label={photo.visibility === "private" ? "Share this photo" : "Make this photo private"}
                title={photo.visibility === "private" ? "Share" : "Make private"}
              >
                <EyeIcon className="h-4 w-4 text-(--text-heading)" />
              </button>
              {paid && (
                <button
                  type="button"
                  onClick={() => onDiagnose(photo.id)}
                  disabled={diagnosingId !== null || diagnosesRemainingToday === 0}
                  className="rounded-full bg-white/90 p-2 hover:bg-white active:scale-95 transition disabled:opacity-50"
                  aria-label="Diagnose this plant"
                  title={diagnosesRemainingToday === 0 ? "No plant checks left today" : diagnosingId === photo.id ? "Diagnosing…" : "Diagnose"}
                >
                  <LeafAccent className="h-4 w-4 text-(--brand-primary)" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(photo.id)}
                className="rounded-full bg-white/90 p-2 hover:bg-red-100 active:scale-95 transition"
                aria-label="Delete this photo"
                title="Delete"
              >
                <TrashIcon className="h-4 w-4 text-red-700" />
              </button>
            </div>
          </div>
          {(photo.caption || photo.tagLabel) && (
            <div className="flex flex-col gap-0.5 p-2 text-xs">
              {photo.tagLabel && <p className="font-medium text-(--brand-primary)">{photo.tagLabel}</p>}
              {photo.caption && <p>{photo.caption}</p>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
