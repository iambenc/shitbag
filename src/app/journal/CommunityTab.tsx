"use client";

import { useState } from "react";
import { JournalIcon } from "@/components/icons";
import type { SharedPhoto } from "./types";

// Today's existing "Shared in {tenant}" grid, relabelled "Community" — same
// query (all tenant-wide photoJournalEntries with visibility="shared_tenant"),
// same Report action. No separate "Community" concept exists in this app;
// this tab IS that existing tenant-wide sharing feature. Now also includes
// shared notes (`url: null`, `body` set instead) — rendered as a text card
// rather than an image tile, everything else (tag, owner, report) unchanged.
export function CommunityTab({ photos, onReport }: { photos: SharedPhoto[]; onReport: (photoId: string) => void }) {
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());

  async function handleReport(photoId: string) {
    const reason = window.prompt("Why are you reporting this?");
    if (!reason) return;
    onReport(photoId);
    setReportedIds((prev) => new Set(prev).add(photoId));
  }

  if (photos.length === 0) {
    return <p className="text-sm text-(--text-muted)">No one has shared anything yet.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => (
        <div key={photo.id} className="flex flex-col gap-1 overflow-hidden rounded-lg border border-black/10 bg-white">
          {photo.url ? (
            /* eslint-disable-next-line @next/next/no-img-element -- locally-stored user upload, not an optimizable static asset */
            <img src={photo.url} alt={photo.caption ?? "Garden photo"} className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square w-full flex-col items-center justify-center gap-1 bg-(--surface-tint) p-3 text-center">
              <JournalIcon className="h-6 w-6 text-(--brand-primary)" />
              <p className="line-clamp-4 text-xs">{photo.body}</p>
            </div>
          )}
          <div className="flex flex-col gap-1 p-2 text-xs">
            {photo.tagLabel && <p className="font-medium text-(--brand-primary)">{photo.tagLabel}</p>}
            {photo.caption && <p>{photo.caption}</p>}
            <p className="text-(--text-muted)">{photo.isOwn ? "You" : photo.ownerEmail}</p>
            {/* reportPhotoAction only knows about photoJournalEntries rows —
                a note has no reporting path yet, so the control is hidden
                rather than shown as a silent no-op. */}
            {!photo.isOwn &&
              photo.url &&
              (reportedIds.has(photo.id) ? (
                <p className="text-(--text-muted)">Reported</p>
              ) : (
                <button type="button" onClick={() => handleReport(photo.id)} className="text-left text-(--text-muted) hover:text-red-700">
                  Report
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
