"use client";

import { useMemo, useState } from "react";
import { CarrotIcon, CameraIcon, JournalIcon } from "@/components/icons";
import { LeafAccent } from "@/components/LeafAccent";
import { EntryCard } from "./EntryCard";
import type { JournalEntry } from "./types";

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const PAGE_SIZE = 10;

function monthKey(dateIso: string) {
  return dateIso.slice(0, 7);
}
function monthLabel(dateIso: string) {
  const d = new Date(dateIso);
  return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}
function dayParts(dateIso: string) {
  const d = new Date(dateIso);
  return { day: d.getDate(), month: d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase() };
}

export function Timeline({
  entries,
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
  entries: JournalEntry[];
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = entries.slice(0, visibleCount);

  // Entries arrive pre-sorted (most recent first) from page.tsx, so a Map
  // preserves chronological month order for free — no re-sorting needed.
  const groups = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const entry of visible) {
      const key = monthKey(entry.dateIso);
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [visible]);

  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
        <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
        <p className="text-sm text-(--text-muted)">Nothing here yet — add a photo, jot a note, or record a harvest to start your story.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map(([key, groupEntries]) => (
        <div key={key}>
          <h2 className="font-display text-xl font-semibold text-(--brand-primary)">{monthLabel(groupEntries[0].dateIso)}</h2>
          <div className="mt-4 flex flex-col">
            {groupEntries.map((entry, i) => {
              const { day, month } = dayParts(entry.dateIso);
              const Icon = entry.kind === "harvest" ? CarrotIcon : entry.kind === "note" ? JournalIcon : CameraIcon;
              return (
                <div key={entry.id} className="flex gap-3 sm:gap-4">
                  <div className="flex w-12 shrink-0 flex-col items-center sm:w-14">
                    <div className="text-center">
                      <p className="text-base font-semibold leading-none">{day}</p>
                      <p className="mt-0.5 text-[10px] text-(--text-muted)">{month}</p>
                    </div>
                    <div className="mt-2 flex flex-1 flex-col items-center">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          entry.kind === "harvest"
                            ? "bg-orange-100 text-orange-700"
                            : entry.kind === "note"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-(--brand-primary)/15 text-(--brand-primary)"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      {i < groupEntries.length - 1 && <div className="mt-1 w-px flex-1 bg-black/10" />}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 pb-6">
                    <EntryCard
                      entry={entry}
                      tenantName={tenantName}
                      paid={paid}
                      diagnosingId={diagnosingId}
                      diagnosesRemainingToday={diagnosesRemainingToday}
                      onToggleVisibility={onToggleVisibility}
                      onDiagnose={onDiagnose}
                      onDeletePhoto={onDeletePhoto}
                      onDeleteHarvest={onDeleteHarvest}
                      onDeleteNote={onDeleteNote}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {visibleCount < entries.length && (
        <button
          type="button"
          onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          className="self-center rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
        >
          Load more entries
        </button>
      )}
    </div>
  );
}
