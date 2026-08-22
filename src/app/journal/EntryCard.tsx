"use client";

import { useState } from "react";
import { EyeIcon, TrashIcon, MoreIcon, PinIcon } from "@/components/icons";
import { LeafAccent } from "@/components/LeafAccent";
import type { JournalEntry } from "./types";

export function EntryCard({
  entry,
  tenantName,
  paid,
  diagnosingId,
  diagnosesRemainingToday,
  onToggleVisibility,
  onDiagnose,
  onDeletePhoto,
  onDeleteHarvest,
  onDeleteNote,
}: {
  entry: JournalEntry;
  tenantName: string;
  paid: boolean;
  diagnosingId: string | null;
  diagnosesRemainingToday: number;
  onToggleVisibility: (entry: JournalEntry) => void;
  onDiagnose: (photoId: string) => void;
  onDeletePhoto: (photoId: string) => void;
  onDeleteHarvest: (harvestId: string) => void;
  onDeleteNote: (noteId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const title =
    entry.caption ?? (entry.kind === "harvest" ? `${entry.cropEmoji ?? "🌱"} ${entry.cropName}` : "Garden photo");

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card sm:flex-row">
      {entry.photoUrl && (
        <div className="h-40 w-full shrink-0 overflow-hidden rounded-md sm:h-32 sm:w-32">
          {/* eslint-disable-next-line @next/next/no-img-element -- locally-stored user upload, not an optimizable static asset */}
          <img src={entry.photoUrl} alt={entry.caption ?? "Garden photo"} className="h-full w-full object-cover" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.kind === "harvest" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                Harvest
              </span>
            )}
            {entry.kind === "note" && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-800">
                Note
              </span>
            )}
            {entry.visibility && (
              <span
                className="flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-(--text-muted)"
                title={entry.visibility === "private" ? "Only visible to you" : `Shared with everyone in ${tenantName}`}
              >
                <EyeIcon className="h-3 w-3 shrink-0" />
                {entry.visibility === "private" ? "Private" : "Shared"}
              </span>
            )}
          </div>

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-full p-1.5 text-(--text-muted) hover:bg-black/5"
              aria-label={`More actions for ${title}`}
              aria-expanded={menuOpen}
            >
              <MoreIcon className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg"
                onMouseLeave={() => setMenuOpen(false)}
              >
                {(entry.photoId || entry.noteId) && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onToggleVisibility(entry);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5"
                  >
                    {entry.visibility === "private" ? "Share with everyone" : "Make private"}
                  </button>
                )}
                {entry.photoId && paid && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDiagnose(entry.photoId!);
                    }}
                    disabled={diagnosingId !== null || diagnosesRemainingToday === 0}
                    className="block w-full px-3 py-2 text-left text-xs hover:bg-black/5 disabled:opacity-50"
                  >
                    {diagnosesRemainingToday === 0 ? "No plant checks left today" : "Diagnose this plant"}
                  </button>
                )}
                {entry.photoId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeletePhoto(entry.photoId!);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                  >
                    <TrashIcon className="mr-1 inline h-3.5 w-3.5" />
                    Delete photo
                  </button>
                ) : entry.noteId ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeleteNote(entry.noteId!);
                    }}
                    className="block w-full px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                  >
                    <TrashIcon className="mr-1 inline h-3.5 w-3.5" />
                    Delete note
                  </button>
                ) : (
                  entry.harvestId && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onDeleteHarvest(entry.harvestId!);
                      }}
                      className="block w-full px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
                    >
                      <TrashIcon className="mr-1 inline h-3.5 w-3.5" />
                      Delete harvest
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        <p className="mt-1 font-display text-base font-semibold">{title}</p>
        {entry.caption && entry.kind === "harvest" && <p className="text-sm text-(--text-muted)">{entry.cropEmoji} {entry.cropName}</p>}

        {entry.kind === "harvest" && entry.quantity != null && (
          <p className="mt-1 text-sm text-(--text-muted)">
            {entry.quantity}
            {entry.unit} harvested
          </p>
        )}
        {entry.varietyName && <p className="text-sm text-(--text-muted)">{entry.varietyName}</p>}
        {entry.areaLabel && (
          <p className="mt-1 flex items-center gap-1 text-xs text-(--text-muted)">
            <PinIcon className="h-3 w-3 shrink-0" />
            {entry.areaLabel}
          </p>
        )}
        {entry.notes && (
          <p className="mt-2 flex items-start gap-1.5 text-sm italic text-(--text-muted)">
            <LeafAccent className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--brand-primary)" />
            &ldquo;{entry.notes}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
