"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, type PanInfo } from "framer-motion";
import {
  saveGrowingAreaPositionAction,
  unplaceGrowingAreaAction,
  addGrowingAreaFromLayoutAction,
  setPlotBoundaryAction,
  resetLayoutAction,
  setGrowingAreaRotationAction,
} from "@/lib/actions/garden/layout";
import {
  footprintCm,
  rotatedFootprintCm,
  nextRotationDeg,
  snapToGrid,
  isTooClose,
  suggestPositions,
  hasHeight,
  hasDepth,
  HEIGHT_TYPES,
  WALKWAY_CLEARANCE_CM,
  GRID_CM,
  type PositionedRect,
} from "@/lib/garden/layout";
import { CONTAINER_GROWING_AREA_TYPES } from "@/lib/garden/equipmentMapping";
import { growingAreaTypeLabels, growingAreaTypeEmoji, formatSizeValue } from "@/lib/garden/labels";
import { growingAreaTypeEnum, type GrowingAreaType, type GrowingAreaStatus, type SizeUnit } from "@/db/schema";

type Occupant = { cropName: string; cropEmoji: string };

type Area = {
  id: string;
  type: GrowingAreaType;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
  heightCm: number | null;
  status: GrowingAreaStatus;
  positionXCm: number | null;
  positionYCm: number | null;
  rotationDeg: number;
  occupant: Occupant | null;
};

// A real plot could be tens of metres across — this is a scaled-down
// proportional view, same idea as GrowingAreaManager's old VisualizationCard
// scaling, just for the whole plot rather than one item.
const MAX_CANVAS_WIDTH_PX = 640;
const MAX_CANVAS_HEIGHT_PX = 480;
const MAX_SCALE_PX_PER_CM = 3;
// Matches the canvas container's own `border-2` below.
const CONTAINER_BORDER_PX = 2;
// The tray still isn't a scaled map of real cm positions (that's the
// plot's job) — cards aren't laid out at proportional coordinates, just
// flex-wrapped. Every card renders at this one fixed size regardless of
// its real footprint, so the tray reads as a tidy uniform grid rather
// than cards of varying size.
const TRAY_CARD_PX = 64;

// Height-shading heuristic per the user's chosen approach: mostly no real
// mature-height data exists (crops has none), so container TYPE stands in
// for height — raised beds/planters/greenhouses/mini-greenhouses are
// treated as tall-capable, pots/seed trays/cold frames (knee-height,
// sloped-lid boxes) as low. Real heightCm data does now exist for
// greenhouse/mini_greenhouse/cold_frame (see HEIGHT_TYPES in layout.ts),
// but this heuristic deliberately stays the same simple boolean-per-type
// model rather than comparing actual values — a reasonable future
// enhancement, not required today. "South" = greater Y in this canvas's
// north-up convention, and this is UK/Northern-hemisphere-only — this app
// has no hemisphere handling anywhere else despite already storing
// latitude, so that's a known, deliberate simplification here, not an
// oversight.
const TALL_TYPES: GrowingAreaType[] = ["raised_bed", "planter", "greenhouse", "mini_greenhouse", "polytunnel"];
const SHADE_CHECK_DISTANCE_CM = 150;

// Custom per-type icons for this canvas only — deliberately NOT touching
// labels.ts's shared growingAreaTypeEmoji (still used as-is by
// GrowingAreaManager.tsx and grow-plan/page.tsx). Only types with a real
// asset in public/icons/growing-areas/ appear here; everything else falls
// back to the shared emoji below.
const CUSTOM_ICON_SRC: Partial<Record<GrowingAreaType, string>> = {
  seed_tray: "/icons/growing-areas/seed_tray.png",
  greenhouse: "/icons/growing-areas/greenhouse.png",
  pot: "/icons/growing-areas/pot.png",
  planter: "/icons/growing-areas/planter.png",
  raised_bed: "/icons/growing-areas/raised_bed.png",
  bed: "/icons/growing-areas/bed.png",
  mini_greenhouse: "/icons/growing-areas/mini_greenhouse.png",
  cold_frame: "/icons/growing-areas/cold_frame.png",
};

function sizeText(row: Pick<Area, "sizeValue" | "sizeUnit" | "widthCm" | "lengthCm" | "depthCm" | "heightCm">) {
  const sized = formatSizeValue(row.sizeValue, row.sizeUnit);
  const dims = sized ?? (row.widthCm && row.lengthCm ? `${row.widthCm}×${row.lengthCm}${row.depthCm ? `×${row.depthCm}` : ""}cm` : null);
  if (dims && row.heightCm) return `${dims}, ${row.heightCm}cm tall`;
  return dims;
}

function usesSizedFields(type: GrowingAreaType) {
  return type === "pot" || type === "seed_tray" || type === "grow_bag";
}

function statusClasses(status: GrowingAreaStatus) {
  if (status === "in_use") return "border-(--brand-primary)/40 bg-(--brand-primary)/10";
  if (status === "reserved") return "border-(--color-terracotta)/40 bg-(--color-terracotta)/10";
  return "border-black/15 bg-white";
}

// Identifies "the same equipment" — same type + every dimension — shared by
// groupSetAside's tray-card collapsing below and the stacked-vs-unique split
// suggestPositions candidates get filtered through (see suggestionCandidates
// in LayoutCanvas). Two areas with this same key are physically
// interchangeable stock (e.g. two 25cm pots), not two meaningfully distinct
// items.
function stackKey(area: Pick<Area, "type" | "sizeValue" | "sizeUnit" | "widthCm" | "lengthCm" | "depthCm" | "heightCm" | "rotationDeg">) {
  return [area.type, area.sizeValue, area.sizeUnit, area.widthCm, area.lengthCm, area.depthCm, area.heightCm, area.rotationDeg].join(
    "|",
  );
}

type SetAsideGroup = { key: string; representative: Area; count: number; doesntFit: boolean };

// Collapses identical set-aside areas (same stackKey) into one card with a
// count, same "3x 20cm pots" convention this app already uses for owned
// equipment (see EquipmentPicker/confirmGrowingAreaProposalsAction) —
// simpler to scan than a card per instance once several build up.
// Occupant-bearing areas never merge: which crop is growing where is
// meaningfully different information, not a duplicate. Dragging a group's
// card acts on its `representative` area only; the group naturally shrinks
// (or its representative changes) as areas leave the set-aside list.
function groupSetAside(areas: Area[], overflowIds: Set<string>): SetAsideGroup[] {
  const groups = new Map<string, SetAsideGroup>();
  const individual: SetAsideGroup[] = [];
  for (const area of areas) {
    const doesntFit = overflowIds.has(area.id);
    if (area.occupant) {
      individual.push({ key: area.id, representative: area, count: 1, doesntFit });
      continue;
    }
    const key = `${stackKey(area)}|${doesntFit}`;
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { key, representative: area, count: 1, doesntFit });
  }
  return [...groups.values(), ...individual];
}

// Splits unplaced, non-dismissed candidates into the ones that should get
// an automatic suggested spot on the plot (a genuinely one-of-a-kind area —
// there's no ambiguity about "which one," so suggesting it saves the user a
// step) versus ones that shouldn't (2+ interchangeable instances of the
// same equipment — e.g. three 25cm pots) — those stay in the tray as one
// grouped card, requiring the user to drag them onto the plot individually
// rather than all landing on the canvas simultaneously as separate
// suggestions. An occupant-bearing area is always treated as one-of-a-kind
// regardless of how many share its stackKey, same "never merge" rule
// groupSetAside applies — which crop is growing where is never
// interchangeable. As a stack shrinks (its members get dragged out one by
// one), the last remaining instance naturally becomes "one-of-a-kind" on a
// later render and starts getting suggested a spot like any other unique
// area.
function splitStackedCandidates(candidates: Area[]): { unique: Area[]; stackedIds: Set<string> } {
  const groups = new Map<string, Area[]>();
  for (const area of candidates) {
    const key = area.occupant ? `occupant:${area.id}` : stackKey(area);
    const existing = groups.get(key);
    if (existing) existing.push(area);
    else groups.set(key, [area]);
  }
  const unique: Area[] = [];
  const stackedIds = new Set<string>();
  for (const group of groups.values()) {
    if (group.length > 1) {
      for (const area of group) stackedIds.add(area.id);
    } else {
      unique.push(group[0]);
    }
  }
  return { unique, stackedIds };
}

// Doubles as both the very first "no plot yet" setup screen (no
// initial*/onCancel — nothing to go back to) and, once a plot exists, an
// inline editor for resizing it (pre-filled, with a Cancel button back to
// the canvas) — same action either way, setPlotBoundaryAction is a plain
// upsert with no distinction between "setting" and "resizing."
function PlotBoundaryForm({
  initialWidthCm,
  initialLengthCm,
  onSaved,
  onCancel,
}: {
  initialWidthCm?: number;
  initialLengthCm?: number;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [widthCm, setWidthCm] = useState(initialWidthCm?.toString() ?? "");
  const [lengthCm, setLengthCm] = useState(initialLengthCm?.toString() ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEditing = initialWidthCm != null && initialLengthCm != null;

  async function handleSave() {
    setError(null);
    setPending(true);
    const result = await setPlotBoundaryAction(Number(widthCm), Number(lengthCm));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
    onSaved?.();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-6 shadow-card">
      <div>
        <p className="font-display text-lg font-semibold">{isEditing ? "Resize your plot" : "Set your plot size"}</p>
        <p className="mt-1 text-sm text-(--text-muted)">
          {isEditing ? (
            "Adjusting this reflows every suggested (unconfirmed) spot to fit the new size — anything you've already confirmed keeps its exact position, even if that now falls outside the new bounds."
          ) : (
            <>
              Enter your plot&rsquo;s overall width and length so we can lay out your growing areas — or{" "}
              <Link href="/garden/estimate" className="text-(--brand-primary) underline">
                estimate it from photos
              </Link>{" "}
              instead.
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Width (cm)
          <input
            type="number"
            min={1}
            value={widthCm}
            onChange={(e) => setWidthCm(e.target.value)}
            className="w-28 rounded-md border border-black/15 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Length (cm)
          <input
            type="number"
            min={1}
            value={lengthCm}
            onChange={(e) => setLengthCm(e.target.value)}
            className="w-28 rounded-md border border-black/15 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !widthCm || !lengthCm}
          className="rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {isEditing && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-full border border-black/15 px-4 py-2 text-sm hover:bg-black/5 active:scale-95 transition disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

function AddAreaForm({
  onAdded,
  allowedTypes = growingAreaTypeEnum,
  parentGrowingAreaId = null,
}: {
  onAdded: (area: Area) => void;
  allowedTypes?: readonly GrowingAreaType[];
  parentGrowingAreaId?: string | null;
}) {
  // "pot" is always a member of both the full enum (main plot) and
  // CONTAINER_GROWING_AREA_TYPES (a structure's own sub-plot) — a single
  // fixed default, unaffected by allowedTypes, preserves the main plot's
  // existing default rather than switching it to whatever happens to sort
  // first in growingAreaTypeEnum.
  const [type, setType] = useState<GrowingAreaType>("pot");
  const [sizeValue, setSizeValue] = useState("");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("cm");
  const [widthCm, setWidthCm] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [depthCm, setDepthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    setPending(true);
    // Snapshotted before the await — the Size/Width/Length/etc. inputs
    // aren't themselves disabled during a pending submission (only the
    // button is), so a user can start typing the NEXT area's dimensions
    // while this one's request is still in flight. Clearing unconditionally
    // once it resolves would silently wipe out whatever they'd already
    // typed for the next entry.
    const submitted = { sizeValue, sizeUnit, widthCm, lengthCm, depthCm, heightCm };
    const result = await addGrowingAreaFromLayoutAction({
      type,
      sizeValue: usesSizedFields(type) && submitted.sizeValue ? Number(submitted.sizeValue) : null,
      sizeUnit: usesSizedFields(type) && submitted.sizeValue ? submitted.sizeUnit : null,
      widthCm: !usesSizedFields(type) && submitted.widthCm ? Number(submitted.widthCm) : null,
      lengthCm: !usesSizedFields(type) && submitted.lengthCm ? Number(submitted.lengthCm) : null,
      depthCm: !usesSizedFields(type) && hasDepth(type) && submitted.depthCm ? Number(submitted.depthCm) : null,
      heightCm: hasHeight(type) && submitted.heightCm ? Number(submitted.heightCm) : null,
      parentGrowingAreaId,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAdded({ ...result.area, status: "available", occupant: null });
    setSizeValue((v) => (v === submitted.sizeValue ? "" : v));
    setWidthCm((v) => (v === submitted.widthCm ? "" : v));
    setLengthCm((v) => (v === submitted.lengthCm ? "" : v));
    setDepthCm((v) => (v === submitted.depthCm ? "" : v));
    setHeightCm((v) => (v === submitted.heightCm ? "" : v));
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-black/10 bg-white p-4 shadow-card">
      <label className="flex flex-col gap-1 text-xs">
        Type
        <select
          value={type}
          onChange={(e) => setType(e.target.value as GrowingAreaType)}
          className="rounded-md border border-black/15 px-2 py-1.5 text-sm"
        >
          {allowedTypes.map((t) => (
            <option key={t} value={t}>
              {growingAreaTypeLabels[t]}
            </option>
          ))}
        </select>
      </label>
      {usesSizedFields(type) ? (
        <label className="flex flex-col gap-1 text-xs">
          Size
          <div className="flex gap-1">
            <input
              type="number"
              min={0}
              step="any"
              placeholder="e.g. 25"
              value={sizeValue}
              onChange={(e) => setSizeValue(e.target.value)}
              className="w-20 rounded-md border border-black/15 px-2 py-1.5 text-sm"
            />
            <select
              value={sizeUnit}
              onChange={(e) => setSizeUnit(e.target.value as SizeUnit)}
              className="rounded-md border border-black/15 px-2 py-1.5 text-sm"
            >
              <option value="cm">cm</option>
              <option value="litres">L</option>
            </select>
          </div>
        </label>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs">
            Width (cm)
            <input
              type="number"
              min={1}
              value={widthCm}
              onChange={(e) => setWidthCm(e.target.value)}
              className="w-24 rounded-md border border-black/15 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            Length (cm)
            <input
              type="number"
              min={1}
              value={lengthCm}
              onChange={(e) => setLengthCm(e.target.value)}
              className="w-24 rounded-md border border-black/15 px-2 py-1.5 text-sm"
            />
          </label>
          {hasDepth(type) && (
            <label className="flex flex-col gap-1 text-xs">
              Depth (cm)
              <input
                type="number"
                min={1}
                value={depthCm}
                onChange={(e) => setDepthCm(e.target.value)}
                className="w-24 rounded-md border border-black/15 px-2 py-1.5 text-sm"
              />
            </label>
          )}
          {hasHeight(type) && (
            <label className="flex flex-col gap-1 text-xs">
              Height (cm)
              <input
                type="number"
                min={1}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className="w-24 rounded-md border border-black/15 px-2 py-1.5 text-sm"
              />
            </label>
          )}
        </>
      )}
      <button
        type="button"
        onClick={handleAdd}
        disabled={pending}
        className="rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
      >
        {pending ? "Adding…" : "+ Add growing area"}
      </button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </div>
  );
}

function ConfirmResetModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-layout-heading"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg"
      >
        <p id="reset-layout-heading" className="font-display text-lg font-semibold">
          Reset your layout?
        </p>
        <p className="mt-2 text-sm text-(--text-muted)">
          Every placed area goes back to a fresh suggestion, and anything you&rsquo;ve set aside gets
          reconsidered too.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-black/15 px-4 py-1.5 text-sm hover:bg-black/5 active:scale-95 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-(--brand-primary) px-4 py-1.5 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
          >
            Yes, reset
          </button>
        </div>
      </div>
    </div>
  );
}

export function LayoutCanvas({
  plotWidthCm,
  plotLengthCm,
  areas: initialAreas,
  containerAreaId,
}: {
  plotWidthCm: number | null;
  plotLengthCm: number | null;
  areas: Area[];
  // Set only when this canvas represents a structure's own interior (see
  // /garden/layout/[areaId]/page.tsx), not the user's one main plot —
  // plotWidthCm/plotLengthCm then come from that structure's own
  // widthCm/lengthCm, not the editable userProfiles plot boundary, so the
  // "Edit size"/PlotBoundaryForm affordance (which writes to that profile
  // field) is hidden in this mode; resizing a structure goes through owning
  // it, same as any other equipment.
  containerAreaId?: string;
}) {
  const router = useRouter();
  const [areas, setAreas] = useState(initialAreas);
  // Resyncs when the parent Server Component re-renders with fresh data
  // (e.g. after router.refresh()) — same "adjusting state when a prop
  // changes" pattern GrowingAreaManager.tsx already established for this
  // exact situation, not a useEffect.
  const [prevInitialAreas, setPrevInitialAreas] = useState(initialAreas);
  if (initialAreas !== prevInitialAreas) {
    setPrevInitialAreas(initialAreas);
    setAreas(initialAreas);
  }
  const [resetting, setResetting] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  // Bumped on every drag end, win or lose — folded into each card's `key`
  // below so it always remounts after a drag, even a "no-op" one (dragged
  // within the tray and dropped back in the tray, or dropped back at
  // ~exactly the same plot spot). Without this, framer-motion's own
  // internal drag transform lingers on the DOM node after a drag that
  // didn't change any state, leaving the card visually offset from where
  // its actual (unchanged) layout position says it should be.
  const [dragTick, setDragTick] = useState(0);
  // Areas the user has explicitly set aside this visit — dragged off the
  // plot, whether they were a real confirmed placement or just an
  // unconfirmed suggestion. Purely client-side/ephemeral (resets on
  // reload): there's no need to persist "I don't want a suggestion for
  // this right now" the same way a real position is persisted, and
  // recomputing fresh suggestions on the next visit is the desired
  // behaviour, not a bug. Without this set, a dismissed area would just
  // reappear as a suggestion on the very next render (still unplaced,
  // still a valid candidate), making "drag it off to set aside" look
  // broken.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const plotRef = useRef<HTMLDivElement>(null);
  // Once a plot boundary exists, PlotBoundaryForm is hidden by default
  // (the canvas takes over) — this brings it back, inline and pre-filled,
  // as the only way to resize an already-set plot. Reset to false whenever
  // the resize form itself saves/cancels, not tied to router.refresh (a
  // fresh plotWidthCm/plotLengthCm prop arriving is what actually redraws
  // the canvas at the new size; this flag just controls which of the two
  // is showing).
  const [editingPlotSize, setEditingPlotSize] = useState(false);

  if (!plotWidthCm || !plotLengthCm) {
    return <PlotBoundaryForm />;
  }

  if (editingPlotSize && !containerAreaId) {
    return (
      <PlotBoundaryForm
        initialWidthCm={plotWidthCm}
        initialLengthCm={plotLengthCm}
        onSaved={() => setEditingPlotSize(false)}
        onCancel={() => setEditingPlotSize(false)}
      />
    );
  }

  async function confirmReset() {
    setConfirmingReset(false);
    setResetting(true);
    const result = await resetLayoutAction(containerAreaId ?? null);
    setResetting(false);
    if (result.ok) {
      setAreas((prev) => prev.map((a) => ({ ...a, positionXCm: null, positionYCm: null })));
      setDismissed(new Set());
    }
  }

  const scale = Math.min(MAX_CANVAS_WIDTH_PX / plotWidthCm, MAX_CANVAS_HEIGHT_PX / plotLengthCm, MAX_SCALE_PX_PER_CM);
  // Absolutely-positioned children sit inside the container's PADDING box,
  // which is inset from its declared width/height by its own border (the
  // canvas below is `border-2`) — without subtracting that here, a card
  // clamped to "the full container width" still renders a couple of px
  // past the container's actual outer edge.
  const containerWidthPx = plotWidthCm * scale - 2 * CONTAINER_BORDER_PX;
  const containerHeightPx = plotLengthCm * scale - 2 * CONTAINER_BORDER_PX;

  const placed = areas.filter((a) => a.positionXCm != null && a.positionYCm != null);
  const placedRects: PositionedRect[] = placed.map((a) => ({
    x: a.positionXCm!,
    y: a.positionYCm!,
    type: a.type,
    ...rotatedFootprintCm(footprintCm(a), a.rotationDeg),
  }));

  // Every unplaced, non-dismissed, one-of-a-kind area gets an automatically
  // suggested spot on the plot — the whole point of this feature: propose a
  // layout instead of leaving the user to place everything by hand. 2+
  // interchangeable instances of the same equipment (e.g. three 25cm pots)
  // are deliberately excluded here (see splitStackedCandidates) — they stay
  // in the tray as one grouped card instead of all landing on the plot as
  // separate suggestions simultaneously, so the user drags them onto the
  // canvas individually. Nothing here is written to the database; a
  // suggestion only becomes real the moment the user drags it (accepting
  // it, possibly adjusted). Recomputed fresh on every render, so it always
  // reflects the current placed/dismissed state — cheap enough at the item
  // counts this feature deals with.
  const suggestionCandidates = areas.filter((a) => (a.positionXCm == null || a.positionYCm == null) && !dismissed.has(a.id));
  const { unique: uniqueCandidates, stackedIds } = splitStackedCandidates(suggestionCandidates);
  const { placed: suggestedSpots, overflow } = suggestPositions(plotWidthCm, plotLengthCm, placedRects, uniqueCandidates);
  const suggestedById = new Map(suggestedSpots.map((s) => [s.id, s]));
  const overflowIds = new Set(overflow);
  const suggestedOnPlot = uniqueCandidates.filter((a) => suggestedById.has(a.id));

  // Every area actually rendered on the plot — real placements and
  // unconfirmed suggestions alike — so overlap/shade warnings and the
  // "is the plot empty" check see the whole picture, not just confirmed
  // ones.
  const onPlot = [
    ...placed.map((area) => ({ area, x: area.positionXCm!, y: area.positionYCm!, saved: true })),
    ...suggestedOnPlot.map((area) => {
      const spot = suggestedById.get(area.id)!;
      return { area, x: spot.x, y: spot.y, saved: false };
    }),
  ];

  // Left with nowhere to go: dismissed by the user, part of an
  // interchangeable stack (see splitStackedCandidates — deliberately never
  // attempted suggestPositions, so never flagged "doesn't fit" until the
  // user actually tries dragging one out), or too big/plot too small for
  // suggestPositions to find a genuinely unique area a spot at all
  // (flagged, never silently dropped).
  const setAside = areas.filter(
    (a) =>
      (a.positionXCm == null || a.positionYCm == null) &&
      (dismissed.has(a.id) || overflowIds.has(a.id) || stackedIds.has(a.id)),
  );

  // Dropping inside the plot's rect places/confirms the area there
  // (centred under the pointer, and un-dismissed if it had been); dropping
  // anywhere else sets it aside — unplacing it server-side first if it had
  // a real confirmed position. The same handler covers every drag
  // regardless of where it started or whether it was already confirmed, so
  // "accept a suggestion," "move a confirmed area," and "remove an area"
  // are really just branches of one rule: where did you let go of it.
  async function handleDragEnd(area: Area, info: PanInfo) {
    setDragTick((t) => t + 1);

    // info.point is page-relative (includes scroll offset), but
    // getBoundingClientRect() is viewport-relative — comparing them
    // directly silently fails to detect a valid drop the moment the page
    // is scrolled at all. Shifting the rect into page coordinates first
    // keeps both sides in the same coordinate system.
    const viewportRect = plotRef.current?.getBoundingClientRect();
    const plotRect = viewportRect && {
      left: viewportRect.left + window.scrollX,
      right: viewportRect.right + window.scrollX,
      top: viewportRect.top + window.scrollY,
      bottom: viewportRect.bottom + window.scrollY,
    };
    const droppedInsidePlot =
      plotRect &&
      info.point.x >= plotRect.left &&
      info.point.x <= plotRect.right &&
      info.point.y >= plotRect.top &&
      info.point.y <= plotRect.bottom;

    if (!droppedInsidePlot) {
      setDismissed((prev) => (prev.has(area.id) ? prev : new Set(prev).add(area.id)));
      if (area.positionXCm == null) return; // was only ever a suggestion — nothing saved to undo
      const previous = area;
      setAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, positionXCm: null, positionYCm: null } : a)));
      const result = await unplaceGrowingAreaAction(area.id);
      if (!result.ok) setAreas((prev) => prev.map((a) => (a.id === area.id ? previous : a)));
      return;
    }

    setDismissed((prev) => {
      if (!prev.has(area.id)) return prev;
      const next = new Set(prev);
      next.delete(area.id);
      return next;
    });

    const footprint = rotatedFootprintCm(footprintCm(area), area.rotationDeg);
    const originXPx = plotRect.left + CONTAINER_BORDER_PX;
    const originYPx = plotRect.top + CONTAINER_BORDER_PX;
    const maxX = Math.max(0, plotWidthCm! - footprint.widthCm);
    const maxY = Math.max(0, plotLengthCm! - footprint.lengthCm);
    const rawX = (info.point.x - originXPx) / scale - footprint.widthCm / 2;
    const rawY = (info.point.y - originYPx) / scale - footprint.lengthCm / 2;
    const newX = Math.min(Math.max(0, snapToGrid(rawX)), maxX);
    const newY = Math.min(Math.max(0, snapToGrid(rawY)), maxY);

    const previous = area;
    setAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, positionXCm: newX, positionYCm: newY } : a)));
    const result = await saveGrowingAreaPositionAction(area.id, newX, newY, containerAreaId ?? null);
    if (!result.ok) setAreas((prev) => prev.map((a) => (a.id === area.id ? previous : a)));
  }

  // Independent of position — rotating a still-unconfirmed suggestion just
  // changes the footprint suggestPositions computes for it on the next
  // render (see rotatedFootprintCm), it never confirms a placement by
  // itself. Same optimistic-update-then-revert-on-failure shape as
  // handleDragEnd above.
  async function handleRotate(area: Area) {
    const rotationDeg = nextRotationDeg(area.rotationDeg);
    const previous = area.rotationDeg;
    setAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, rotationDeg } : a)));
    const result = await setGrowingAreaRotationAction(area.id, rotationDeg);
    if (!result.ok) setAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, rotationDeg: previous } : a)));
  }

  return (
    <div className="flex flex-col gap-6">
      {confirmingReset && (
        <ConfirmResetModal onConfirm={confirmReset} onCancel={() => setConfirmingReset(false)} />
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-(--text-muted)">
          {containerAreaId ? "Interior size" : "Plot size"}: {plotWidthCm}×{plotLengthCm}cm
        </p>
        {!containerAreaId && (
          <button
            type="button"
            onClick={() => setEditingPlotSize(true)}
            className="rounded-full border border-black/15 px-3 py-1 text-xs hover:bg-black/5 active:scale-95 transition"
          >
            Edit size
          </button>
        )}
      </div>

      <div
        ref={plotRef}
        className="relative overflow-hidden rounded-lg border-2 border-dashed border-(--brand-primary)/30 bg-(--surface-tint)"
        style={{
          width: plotWidthCm * scale,
          height: plotLengthCm * scale,
          // Visible grid lines at the same GRID_CM spacing findFreePosition
          // scans in and snapToGrid snaps drags to — a background pattern
          // rather than one DOM element per line, cheap regardless of plot
          // size and independent of the border-color classes above (a
          // background-image layers over background-color without a
          // shorthand `background` clash).
          backgroundImage:
            "linear-gradient(to right, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.08) 1px, transparent 1px)",
          backgroundSize: `${GRID_CM * scale}px ${GRID_CM * scale}px`,
        }}
      >
        {onPlot.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-(--text-muted)">
            Nothing to place yet — add a growing area below
          </p>
        )}
        {onPlot.map(({ area, x, y, saved }) => {
          const rect = { x, y, type: area.type, ...rotatedFootprintCm(footprintCm(area), area.rotationDeg) };
          const overlapping = onPlot.some((other) => {
            if (other.area.id === area.id) return false;
            const otherRect = {
              x: other.x,
              y: other.y,
              type: other.area.type,
              ...rotatedFootprintCm(footprintCm(other.area), other.area.rotationDeg),
            };
            return isTooClose(rect, otherRect);
          });
          const shaded =
            !TALL_TYPES.includes(area.type) &&
            onPlot.some((other) => {
              if (other.area.id === area.id || !TALL_TYPES.includes(other.area.type)) return false;
              const otherWidth = rotatedFootprintCm(footprintCm(other.area), other.area.rotationDeg).widthCm;
              const xOverlap = Math.max(rect.x, other.x) < Math.min(rect.x + rect.widthCm, other.x + otherWidth);
              return xOverlap && other.y > rect.y && other.y - rect.y < SHADE_CHECK_DISTANCE_CM;
            });

          // This canvas represents the growing areas themselves, not what's
          // planted in them — the icon always shows the area's own type,
          // never the occupant crop's emoji (the label text still surfaces
          // the crop name, just not as the icon).
          const emoji = growingAreaTypeEmoji[area.type];
          const label = area.occupant?.cropName ?? growingAreaTypeLabels[area.type];
          const size = sizeText(area);
          const customIconSrc = CUSTOM_ICON_SRC[area.type];

          // Cards have a legibility floor (24px) below what their true
          // scaled cm-footprint would render at — real at a low scale (a
          // big plot, or many densely-packed pots since the walkway/dense-
          // clearance split), where a tiny logical footprint would
          // otherwise shrink to just a couple of px. Pulling the rendered
          // position inward here (never changing the saved cm position
          // itself) keeps every card fully visible inside the canvas
          // instead of silently clipped by its overflow-hidden border.
          const renderedWidth = Math.max(24, rect.widthCm * scale);
          const renderedHeight = Math.max(24, rect.lengthCm * scale);
          const leftPx = Math.min(rect.x * scale, Math.max(0, containerWidthPx - renderedWidth));
          const topPx = Math.min(rect.y * scale, Math.max(0, containerHeightPx - renderedHeight));

          return (
            <motion.div
              key={`${area.id}:${area.positionXCm}:${area.positionYCm}:${saved}:${dragTick}`}
              drag
              dragMomentum={false}
              dragElastic={0}
              onDragEnd={(_e, info) => handleDragEnd(area, info)}
              className={`absolute flex cursor-grab flex-col items-center justify-center gap-0.5 rounded-md border p-1 text-center shadow-card active:cursor-grabbing ${statusClasses(
                area.status,
              )} ${overlapping ? "ring-2 ring-red-400" : ""} ${!saved ? "border-dashed opacity-60" : ""}`}
              style={{ left: leftPx, top: topPx, width: renderedWidth, height: renderedHeight }}
              title={`${label}${size ? ` · ${size}` : ""}${overlapping ? " · too close to another area" : ""}${shaded ? " · may be shaded by a taller area to the south" : ""} · ${
                saved ? "drag off the plot to remove" : "suggested position — drag to confirm, or drag off to ignore"
              }`}
            >
              {customIconSrc ? (
                <Image
                  src={customIconSrc}
                  alt=""
                  fill
                  sizes="200px"
                  draggable={false}
                  className="pointer-events-none object-contain"
                />
              ) : (
                <span className="text-lg leading-none">{emoji}</span>
              )}
              {shaded && <span className="relative text-[10px] leading-none">🌥️</span>}
              {/* Rotation only ever changes a width/length-based footprint
                  (see rotatedFootprintCm) — a no-op for a pot/seed tray's
                  sizeValue-based square, so the control is hidden for those
                  rather than offered as a button that visibly does nothing.
                  stopPropagation on pointerdown keeps this click from also
                  being read as the start of the card's own drag gesture. */}
              {!usesSizedFields(area.type) && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRotate(area);
                  }}
                  aria-label={`Rotate ${label}`}
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-black/15 bg-white text-[10px] leading-none shadow-card hover:bg-black/5 active:scale-90 transition"
                >
                  ↻
                </button>
              )}
              {/* Only on the main plot, for a confirmed (not merely
                  suggested) structure — the sole discovery path into that
                  structure's own sub-plot (see /garden/layout/[areaId]).
                  Same stopPropagation-on-pointerdown trick as the rotate
                  button above, so tapping it doesn't start a drag. */}
              {!containerAreaId && saved && HEIGHT_TYPES.includes(area.type) && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/garden/layout/${area.id}`);
                  }}
                  aria-label={`View inside ${label}`}
                  className="absolute -bottom-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-black/15 bg-white text-[10px] leading-none shadow-card hover:bg-black/5 active:scale-90 transition"
                >
                  →
                </button>
              )}
            </motion.div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setConfirmingReset(true)}
        disabled={resetting || (placed.length === 0 && dismissed.size === 0)}
        className="self-start rounded-full border border-black/15 px-4 py-1.5 text-xs text-(--text-muted) hover:bg-black/5 active:scale-95 transition disabled:opacity-40"
      >
        {resetting ? "Resetting…" : "Reset layout"}
      </button>

      <p className="text-xs text-(--text-muted)">
        We&rsquo;ve suggested a layout above — faded areas are proposals, not saved yet. Drag one to
        confirm it (adjusting its spot if you like), drag it off the plot to set it aside, or just leave
        it as it is. Dragging snaps to the {GRID_CM}cm grid shown on the plot. If you own several of
        the same thing, they wait together in &ldquo;Not on your plot&rdquo; below rather than all
        landing on the plot at once — drag them onto it one at a time. Pots and seed trays can sit right
        next to each other, but beds, raised beds, and planters need roughly {WALKWAY_CLEARANCE_CM}cm of
        walkway around them — a red outline means that&rsquo;s been broken (you can still leave it
        there, just watch for the warning). ☁️ means an area may be shaded by a taller one to the south.
        Click the ↻ on a width/length-sized area to rotate it 90°.
      </p>

      <div className="rounded-lg border border-black/10 bg-white p-4 shadow-card">
        <p className="text-sm font-medium text-(--text-muted)">
          {containerAreaId ? "Not in this structure" : "Not on your plot"}
        </p>
        {setAside.length === 0 ? (
          <p className="mt-2 text-sm text-(--text-muted)">Nothing set aside.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            {groupSetAside(setAside, overflowIds).map((group) => {
              const area = group.representative;
              // This canvas represents the growing areas themselves, not
              // what's planted in them — the icon always shows the area's
              // own type, never the occupant crop's emoji.
              const emoji = growingAreaTypeEmoji[area.type];
              const label = area.occupant?.cropName ?? growingAreaTypeLabels[area.type];
              const size = sizeText(area);
              // The emoji already conveys type (🪴 = pot), so an
              // unoccupied card's second line shows its actual SIZE
              // instead of just repeating the type name — the whole point
              // being to make the difference between, say, a 15cm and a
              // 45cm pot legible without hovering for the title tooltip.
              // An occupied card still shows the crop name here instead —
              // which crop is growing where stays the more useful thing to
              // see at a glance for those (same priority groupSetAside's
              // own "never merge an occupied area" rule already reflects).
              const secondaryText = area.occupant ? label : (size ?? label);
              const customIconSrc = CUSTOM_ICON_SRC[area.type];
              return (
                <motion.div
                  key={`${group.key}:${dragTick}`}
                  drag
                  dragMomentum={false}
                  dragElastic={0}
                  onDragEnd={(_e, info) => handleDragEnd(area, info)}
                  className={`relative flex cursor-grab flex-col items-center justify-center gap-0.5 rounded-md border p-1 text-center shadow-card active:cursor-grabbing ${statusClasses(
                    area.status,
                  )}`}
                  style={{ width: TRAY_CARD_PX, height: TRAY_CARD_PX }}
                  title={`${label}${size ? ` · ${size}` : ""}${group.count > 1 ? ` · ${group.count} set aside` : ""} · ${
                    group.doesntFit ? "doesn't fit your plot at its current size" : "drag onto the plot to place"
                  }`}
                >
                  {group.count > 1 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--brand-primary) px-1 text-[9px] font-medium text-white">
                      {group.count}
                    </span>
                  )}
                  {customIconSrc ? (
                    <div className="relative min-h-0 w-full flex-1">
                      <Image
                        src={customIconSrc}
                        alt=""
                        fill
                        sizes="120px"
                        draggable={false}
                        className="pointer-events-none object-contain"
                      />
                    </div>
                  ) : (
                    <span className="text-lg leading-none">{emoji}</span>
                  )}
                  <span className="relative line-clamp-1 text-[10px] font-medium leading-none">{secondaryText}</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <AddAreaForm
        onAdded={(area) => setAreas((prev) => [...prev, area])}
        allowedTypes={containerAreaId ? CONTAINER_GROWING_AREA_TYPES : undefined}
        parentGrowingAreaId={containerAreaId ?? null}
      />
    </div>
  );
}
