"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  setPhotoVisibilityAction,
  deletePhotoAction,
  type UploadPhotoState,
} from "@/lib/actions/photos";
import { deleteHarvestAction } from "@/lib/actions/harvests";
import { setNoteVisibilityAction, deleteNoteAction, type AddNoteState } from "@/lib/actions/notes";
import { diagnoseExistingPhotoAction, reportPhotoAction } from "@/lib/actions/plantHealth";
import { JournalIcon, CameraIcon, CarrotIcon, BasketIcon, DashboardIcon, PeopleIcon, PlusIcon } from "@/components/icons";
import { LeafAccent } from "@/components/LeafAccent";
import { totalKg, mostHarvestedCrop } from "@/lib/journal/aggregates";
import { UploadForm } from "./UploadForm";
import { Timeline } from "./Timeline";
import { GalleryTab } from "./GalleryTab";
import { HarvestsTab } from "./HarvestsTab";
import { NotesTab } from "./NotesTab";
import { CommunityTab } from "./CommunityTab";
import { Sidebar } from "./Sidebar";
import { StatCards, type JournalStatCard } from "./StatCards";
import type { JournalEntry, SharedPhoto, GalleryPhoto, HarvestRow, GrowingAreaOption } from "./types";

type Tab = "timeline" | "gallery" | "harvests" | "notes" | "community";

const TAB_LABEL: Record<Tab, string> = {
  timeline: "Timeline",
  gallery: "Gallery",
  harvests: "Harvests",
  notes: "My Notes",
  community: "Community",
};
const TAB_ICON = { timeline: LeafAccent, gallery: DashboardIcon, harvests: CarrotIcon, notes: JournalIcon, community: PeopleIcon };

export function JournalView({
  tenantName,
  currentUserEmail,
  paid,
  diagnosesRemainingToday,
  growingAreaOptions,
  initialEntries,
  initialSharedPhotos,
}: {
  tenantName: string;
  currentUserEmail: string;
  paid: boolean;
  diagnosesRemainingToday: number;
  growingAreaOptions: GrowingAreaOption[];
  initialEntries: JournalEntry[];
  initialSharedPhotos: SharedPhoto[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("timeline");
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [diagnosingId, setDiagnosingId] = useState<string | null>(null);

  // Single source of truth for everything "mine" — Gallery, Harvests, the
  // stat cards, and the sidebar all derive from this one list (below) rather
  // than keeping their own parallel copies, so a delete/upload/visibility
  // change updates every view of it at once. Same class of bug this session
  // already hit once on My Shed's stat cards reading stale server props
  // instead of the live client list.
  const [prevInitialEntries, setPrevInitialEntries] = useState(initialEntries);
  const [entries, setEntries] = useState(initialEntries);
  if (initialEntries !== prevInitialEntries) {
    setPrevInitialEntries(initialEntries);
    setEntries(initialEntries);
  }

  const [prevInitialShared, setPrevInitialShared] = useState(initialSharedPhotos);
  const [sharedPhotos, setSharedPhotos] = useState(initialSharedPhotos);
  if (initialSharedPhotos !== prevInitialShared) {
    setPrevInitialShared(initialSharedPhotos);
    setSharedPhotos(initialSharedPhotos);
  }

  function goToTab(tab: Tab, opts?: { addEntry?: boolean }) {
    setActiveTab(tab);
    if (opts?.addEntry) setAddEntryOpen(true);
  }

  function handleUploaded(photo: NonNullable<UploadPhotoState["photo"]>) {
    const entry: JournalEntry = {
      id: photo.id,
      kind: "photo",
      dateIso: new Date().toISOString(),
      photoId: photo.id,
      photoUrl: photo.url,
      caption: photo.caption,
      visibility: photo.visibility,
      harvestId: null,
      noteId: null,
      cropId: null,
      cropName: null,
      cropEmoji: null,
      varietyName: null,
      quantity: null,
      unit: null,
      notes: null,
      areaLabel: photo.tagLabel,
    };
    setEntries((es) => [entry, ...es]);
    if (photo.visibility === "shared_tenant") {
      setSharedPhotos((ps) => [
        { id: photo.id, url: photo.url, body: null, caption: photo.caption, ownerEmail: currentUserEmail, isOwn: true, tagLabel: photo.tagLabel },
        ...ps,
      ]);
    }
    setAddEntryOpen(false);
  }

  function handleAddedNote(note: NonNullable<AddNoteState["note"]>) {
    const entry: JournalEntry = {
      id: note.id,
      kind: "note",
      dateIso: new Date().toISOString(),
      photoId: null,
      photoUrl: null,
      caption: note.body,
      visibility: note.visibility,
      harvestId: null,
      noteId: note.id,
      cropId: null,
      cropName: null,
      cropEmoji: null,
      varietyName: null,
      quantity: null,
      unit: null,
      notes: null,
      areaLabel: note.tagLabel,
    };
    setEntries((es) => [entry, ...es]);
    if (note.visibility === "shared_tenant") {
      setSharedPhotos((ps) => [
        { id: note.id, url: null, body: note.body, caption: null, ownerEmail: currentUserEmail, isOwn: true, tagLabel: note.tagLabel },
        ...ps,
      ]);
    }
  }

  async function handleToggleVisibility(entry: JournalEntry) {
    const id = entry.photoId ?? entry.noteId;
    if (!id || !entry.visibility) return;
    const visibility = entry.visibility === "private" ? "shared_tenant" : "private";
    setEntries((es) => es.map((e) => (e.id === entry.id ? { ...e, visibility } : e)));
    setSharedPhotos((ps) =>
      visibility === "shared_tenant"
        ? [
            entry.photoId
              ? {
                  id: entry.photoId,
                  url: entry.photoUrl!,
                  body: null,
                  caption: entry.caption,
                  ownerEmail: currentUserEmail,
                  isOwn: true,
                  tagLabel: entry.cropName ? `${entry.cropEmoji ?? ""} ${entry.cropName}`.trim() : entry.areaLabel,
                }
              : { id: entry.noteId!, url: null, body: entry.caption, caption: null, ownerEmail: currentUserEmail, isOwn: true, tagLabel: entry.areaLabel },
            ...ps.filter((p) => p.id !== id),
          ]
        : ps.filter((p) => p.id !== id),
    );
    if (entry.photoId) {
      await setPhotoVisibilityAction(entry.photoId, visibility);
    } else if (entry.noteId) {
      await setNoteVisibilityAction(entry.noteId, visibility);
    }
  }

  function handleToggleGalleryVisibility(photo: GalleryPhoto) {
    const entry = entries.find((e) => e.photoId === photo.id);
    if (entry) handleToggleVisibility(entry);
  }

  async function handleDeletePhoto(photoId: string) {
    // Deleting the PHOTO doesn't delete a linked harvestLog row (the FK is
    // one-way, ON DELETE SET NULL from the photo side) — a harvest-linked
    // entry survives as a harvest-only entry, it doesn't vanish from the
    // Timeline. Only a plain (non-harvest) photo entry disappears entirely.
    setEntries((es) =>
      es.flatMap((e) => {
        if (e.photoId !== photoId) return [e];
        if (e.kind === "harvest") {
          return [{ ...e, photoId: null, photoUrl: null, visibility: null, caption: null }];
        }
        return [];
      }),
    );
    setSharedPhotos((ps) => ps.filter((p) => p.id !== photoId));
    await deletePhotoAction(photoId);
  }

  async function handleDeleteHarvest(harvestId: string) {
    // Deleting the HARVEST doesn't delete a linked photo (same one-way FK,
    // ON DELETE SET NULL) — if this entry had a photo, it survives as a
    // plain photo entry instead of disappearing.
    setEntries((es) =>
      es.flatMap((e) => {
        if (e.harvestId !== harvestId) return [e];
        if (e.photoId) {
          return [
            {
              ...e,
              kind: "photo" as const,
              harvestId: null,
              cropId: null,
              cropName: null,
              cropEmoji: null,
              varietyName: null,
              quantity: null,
              unit: null,
              notes: null,
            },
          ];
        }
        return [];
      }),
    );
    await deleteHarvestAction(harvestId);
  }

  async function handleDeleteNote(noteId: string) {
    // Nothing else references a note (unlike photos/harvests), so it's a
    // plain removal — no FK-survival case to handle.
    setEntries((es) => es.filter((e) => e.noteId !== noteId));
    setSharedPhotos((ps) => ps.filter((p) => p.id !== noteId));
    await deleteNoteAction(noteId);
  }

  async function handleDiagnose(photoId: string) {
    setDiagnosingId(photoId);
    await diagnoseExistingPhotoAction(photoId);
    setDiagnosingId(null);
  }

  async function handleReport(photoId: string) {
    await reportPhotoAction(photoId, "Reported from Journal");
  }

  const thisYear = new Date().getFullYear();
  const entriesThisYear = useMemo(() => entries.filter((e) => new Date(e.dateIso).getFullYear() === thisYear), [entries, thisYear]);
  const photosThisYear = useMemo(() => entriesThisYear.filter((e) => e.photoId), [entriesThisYear]);
  const harvestEntries = useMemo(() => entries.filter((e) => e.kind === "harvest"), [entries]);
  const harvestEntriesThisYear = useMemo(() => entriesThisYear.filter((e) => e.kind === "harvest"), [entriesThisYear]);
  const kgThisYear = useMemo(
    () => totalKg(harvestEntriesThisYear.map((e) => ({ quantity: e.quantity ?? 0, unit: e.unit ?? "" }))),
    [harvestEntriesThisYear],
  );

  const galleryPhotos: GalleryPhoto[] = useMemo(
    () =>
      entries
        .filter((e): e is JournalEntry & { photoId: string; photoUrl: string; visibility: NonNullable<JournalEntry["visibility"]> } =>
          Boolean(e.photoId && e.photoUrl && e.visibility),
        )
        .map((e) => ({
          id: e.photoId,
          url: e.photoUrl,
          caption: e.caption,
          visibility: e.visibility,
          tagLabel: e.areaLabel ?? (e.cropName ? `${e.cropEmoji ?? ""} ${e.cropName}`.trim() : null),
        })),
    [entries],
  );

  const harvestRows: HarvestRow[] = useMemo(
    () =>
      harvestEntries.map((e) => ({
        id: e.harvestId!,
        cropName: e.cropName!,
        cropEmoji: e.cropEmoji ?? "🌱",
        varietyName: e.varietyName,
        quantity: e.quantity ?? 0,
        unit: e.unit ?? "",
        harvestedAt: e.dateIso.slice(0, 10),
        notes: e.notes,
        hasPhoto: Boolean(e.photoId),
      })),
    [harvestEntries],
  );

  const noteEntries = useMemo(() => entries.filter((e) => e.kind === "note"), [entries]);

  const mostHarvested = useMemo(
    () =>
      mostHarvestedCrop(
        harvestEntries.map((e) => ({
          cropId: e.cropId!,
          cropName: e.cropName!,
          cropEmoji: e.cropEmoji ?? "🌱",
          quantity: e.quantity ?? 0,
          unit: e.unit ?? "",
        })),
      ),
    [harvestEntries],
  );

  const statCards: JournalStatCard[] = [
    { key: "entries", icon: JournalIcon, value: String(entriesThisYear.length), label: "Entries", sub: "This year" },
    { key: "photos", icon: CameraIcon, value: String(photosThisYear.length), label: "Photos", sub: "This year" },
    { key: "harvests", icon: CarrotIcon, value: String(harvestEntriesThisYear.length), label: "Harvests", sub: "This year" },
    { key: "kg", icon: BasketIcon, value: `${kgThisYear.toFixed(1)} kg`, label: "Harvested", sub: "This year" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-semibold text-(--brand-primary)">
            Garden Journal <LeafAccent className="h-7 w-7" />
          </h1>
          <p className="mt-2 text-sm text-(--text-muted)">A visual story of your garden, season by season.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => goToTab("timeline", { addEntry: true })}
            className="flex items-center gap-1.5 rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
          >
            <PlusIcon className="h-4 w-4" />
            Add journal entry
          </button>
          <Link
            href="/harvests"
            className="flex items-center gap-1.5 rounded-md bg-(--brand-primary) px-4 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
          >
            <CarrotIcon className="h-4 w-4" />
            Record harvest
          </Link>
        </div>
      </div>

      <StatCards cards={statCards} />

      <div className="flex gap-1 overflow-x-auto border-b border-black/10 pb-px">
        {(Object.keys(TAB_LABEL) as Tab[]).map((tab) => {
          const Icon = TAB_ICON[tab];
          return (
            <button
              key={tab}
              type="button"
              onClick={() => goToTab(tab)}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "border-(--brand-primary) text-(--brand-primary)"
                  : "border-transparent text-(--text-muted) hover:text-(--text-heading)"
              }`}
            >
              <Icon className="h-4 w-4" />
              {TAB_LABEL[tab]}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {addEntryOpen && (
            <UploadForm growingAreaOptions={growingAreaOptions} onUploaded={handleUploaded} />
          )}

          {activeTab === "timeline" && (
            <Timeline
              entries={entries}
              tenantName={tenantName}
              paid={paid}
              diagnosingId={diagnosingId}
              diagnosesRemainingToday={diagnosesRemainingToday}
              onToggleVisibility={handleToggleVisibility}
              onDiagnose={handleDiagnose}
              onDeletePhoto={handleDeletePhoto}
              onDeleteHarvest={handleDeleteHarvest}
              onDeleteNote={handleDeleteNote}
            />
          )}
          {activeTab === "gallery" && (
            <GalleryTab
              photos={galleryPhotos}
              tenantName={tenantName}
              paid={paid}
              diagnosingId={diagnosingId}
              diagnosesRemainingToday={diagnosesRemainingToday}
              onToggleVisibility={handleToggleGalleryVisibility}
              onDiagnose={handleDiagnose}
              onDelete={handleDeletePhoto}
            />
          )}
          {activeTab === "harvests" && <HarvestsTab harvests={harvestRows} onDelete={handleDeleteHarvest} />}
          {activeTab === "notes" && (
            <NotesTab
              notes={noteEntries}
              growingAreaOptions={growingAreaOptions}
              tenantName={tenantName}
              onAdded={handleAddedNote}
              onToggleVisibility={handleToggleVisibility}
              onDeleteNote={handleDeleteNote}
            />
          )}
          {activeTab === "community" && <CommunityTab photos={sharedPhotos} onReport={handleReport} />}
        </div>

        <Sidebar
          mostHarvested={mostHarvested}
          recentHarvests={harvestRows.slice(0, 4)}
          onViewAllHarvests={() => goToTab("harvests")}
          onGoToCommunity={() => goToTab("community")}
        />
      </div>
    </div>
  );
}
