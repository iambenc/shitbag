import type { PhotoVisibility } from "@/db/schema";

// A Timeline entry is either a real photoJournalEntries row (kind: "photo",
// optionally harvest-linked, in which case it also carries the harvest's
// crop/quantity fields) or a harvestLog row with no attached photo (kind:
// "harvest", photoId/photoUrl/visibility all null) — see page.tsx's merge.
export type JournalEntry = {
  id: string;
  kind: "photo" | "harvest" | "note";
  dateIso: string;
  photoId: string | null;
  photoUrl: string | null;
  caption: string | null;
  visibility: PhotoVisibility | null;
  harvestId: string | null;
  noteId: string | null;
  cropId: string | null;
  cropName: string | null;
  cropEmoji: string | null;
  varietyName: string | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
  areaLabel: string | null;
};

export type GalleryPhoto = {
  id: string;
  url: string;
  caption: string | null;
  visibility: PhotoVisibility;
  tagLabel: string | null;
};

export type SharedPhoto = {
  id: string;
  // Null only for a shared note (no image) — CommunityTab renders a text
  // card instead of a photo tile when this is null.
  url: string | null;
  body: string | null;
  caption: string | null;
  ownerEmail: string;
  isOwn: boolean;
  tagLabel: string | null;
};

export type HarvestRow = {
  id: string;
  cropName: string;
  cropEmoji: string;
  varietyName: string | null;
  quantity: number;
  unit: string;
  harvestedAt: string;
  notes: string | null;
  hasPhoto: boolean;
};

export type GrowingAreaOption = { id: string; label: string };
