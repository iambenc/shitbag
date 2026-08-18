"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, type PanInfo } from "framer-motion";
import {
  saveGrowingAreaPositionAction,
  unplaceGrowingAreaAction,
  addGrowingAreaFromLayoutAction,
  setPlotBoundaryAction,
  resetLayoutAction,
} from "@/lib/actions/garden/layout";
import { footprintCm, isTooClose, suggestPositions, WALKWAY_CLEARANCE_CM, type PositionedRect } from "@/lib/garden/layout";
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
  status: GrowingAreaStatus;
  positionXCm: number | null;
  positionYCm: number | null;
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
// Fixed visual size for every tray card, regardless of the area's real
// footprint — the tray is a palette, not a scaled map (that's the plot's
// job), so there's no proportional sizing to preserve here.
const TRAY_CARD_PX = 64;

// Height-shading heuristic per the user's chosen approach: no real
// mature-height data exists anywhere (crops has none), so container TYPE
// stands in for height — raised beds/planters are treated as tall-capable,
// pots/seed trays as low. "South" = greater Y in this canvas's north-up
// convention, and this is UK/Northern-hemisphere-only — this app has no
// hemisphere handling anywhere else despite already storing latitude, so
// that's a known, deliberate simplification here, not an oversight.
const TALL_TYPES: GrowingAreaType[] = ["raised_bed", "planter"];
const SHADE_CHECK_DISTANCE_CM = 150;

function sizeText(row: Pick<Area, "sizeValue" | "sizeUnit" | "widthCm" | "lengthCm" | "depthCm">) {
  const sized = formatSizeValue(row.sizeValue, row.sizeUnit);
  if (sized) return sized;
  if (row.widthCm && row.lengthCm) return `${row.widthCm}×${row.lengthCm}${row.depthCm ? `×${row.depthCm}` : ""}cm`;
  return null;
}

function usesSizedFields(type: GrowingAreaType) {
  return type === "pot" || type === "seed_tray";
}

function statusClasses(status: GrowingAreaStatus) {
  if (status === "in_use") return "border-(--brand-primary)/40 bg-(--brand-primary)/10";
  if (status === "reserved") return "border-(--color-terracotta)/40 bg-(--color-terracotta)/10";
  return "border-black/15 bg-white";
}

type SetAsideGroup = { key: string; representative: Area; count: number; doesntFit: boolean };

// Collapses identical set-aside areas (same type + size/dimensions) into
// one card with a count, same "3x 20cm pots" convention this app already
// uses for owned equipment (see EquipmentPicker/confirmGrowingAreaProposalsAction)
// — simpler to scan than a card per instance once several build up.
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
    const key = [area.type, area.sizeValue, area.sizeUnit, area.widthCm, area.lengthCm, area.depthCm, doesntFit].join("|");
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { key, representative: area, count: 1, doesntFit });
  }
  return [...groups.values(), ...individual];
}

function PlotBoundaryForm() {
  const router = useRouter();
  const [widthCm, setWidthCm] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-black/10 bg-white p-6 shadow-card">
      <div>
        <p className="font-display text-lg font-semibold">Set your plot size</p>
        <p className="mt-1 text-sm text-(--text-muted)">
          Enter your plot&rsquo;s overall width and length so we can lay out your growing areas — or{" "}
          <Link href="/garden/estimate" className="text-(--brand-primary) underline">
            estimate it from photos
          </Link>{" "}
          instead.
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
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

function AddAreaForm({ onAdded }: { onAdded: (area: Area) => void }) {
  const [type, setType] = useState<GrowingAreaType>("pot");
  const [sizeValue, setSizeValue] = useState("");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("cm");
  const [widthCm, setWidthCm] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [depthCm, setDepthCm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    setPending(true);
    const result = await addGrowingAreaFromLayoutAction({
      type,
      sizeValue: usesSizedFields(type) && sizeValue ? Number(sizeValue) : null,
      sizeUnit: usesSizedFields(type) && sizeValue ? sizeUnit : null,
      widthCm: !usesSizedFields(type) && widthCm ? Number(widthCm) : null,
      lengthCm: !usesSizedFields(type) && lengthCm ? Number(lengthCm) : null,
      depthCm: !usesSizedFields(type) && type !== "bed" && depthCm ? Number(depthCm) : null,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onAdded({ ...result.area, status: "available", occupant: null });
    setSizeValue("");
    setWidthCm("");
    setLengthCm("");
    setDepthCm("");
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
          {growingAreaTypeEnum.map((t) => (
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
          {type !== "bed" && (
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
}: {
  plotWidthCm: number | null;
  plotLengthCm: number | null;
  areas: Area[];
}) {
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

  if (!plotWidthCm || !plotLengthCm) {
    return <PlotBoundaryForm />;
  }

  async function confirmReset() {
    setConfirmingReset(false);
    setResetting(true);
    const result = await resetLayoutAction();
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
    ...footprintCm(a),
  }));

  // Every unplaced, non-dismissed area gets an automatically suggested
  // spot on the plot — the whole point of this feature: propose a layout
  // instead of leaving the user to place everything by hand. Nothing here
  // is written to the database; a suggestion only becomes real the moment
  // the user drags it (accepting it, possibly adjusted). Recomputed fresh
  // on every render, so it always reflects the current placed/dismissed
  // state — cheap enough at the item counts this feature deals with.
  const suggestionCandidates = areas.filter((a) => (a.positionXCm == null || a.positionYCm == null) && !dismissed.has(a.id));
  const { placed: suggestedSpots, overflow } = suggestPositions(plotWidthCm, plotLengthCm, placedRects, suggestionCandidates);
  const suggestedById = new Map(suggestedSpots.map((s) => [s.id, s]));
  const overflowIds = new Set(overflow);
  const suggestedOnPlot = suggestionCandidates.filter((a) => suggestedById.has(a.id));

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

  // Left with nowhere to go: dismissed by the user, or too big/plot too
  // small for suggestPositions to find it a spot at all (flagged, never
  // silently dropped).
  const setAside = areas.filter(
    (a) => (a.positionXCm == null || a.positionYCm == null) && (dismissed.has(a.id) || overflowIds.has(a.id)),
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

    const footprint = footprintCm(area);
    const originXPx = plotRect.left + CONTAINER_BORDER_PX;
    const originYPx = plotRect.top + CONTAINER_BORDER_PX;
    const maxX = Math.max(0, plotWidthCm! - footprint.widthCm);
    const maxY = Math.max(0, plotLengthCm! - footprint.lengthCm);
    const newX = Math.min(Math.max(0, (info.point.x - originXPx) / scale - footprint.widthCm / 2), maxX);
    const newY = Math.min(Math.max(0, (info.point.y - originYPx) / scale - footprint.lengthCm / 2), maxY);

    const previous = area;
    setAreas((prev) => prev.map((a) => (a.id === area.id ? { ...a, positionXCm: newX, positionYCm: newY } : a)));
    const result = await saveGrowingAreaPositionAction(area.id, newX, newY);
    if (!result.ok) setAreas((prev) => prev.map((a) => (a.id === area.id ? previous : a)));
  }

  return (
    <div className="flex flex-col gap-6">
      {confirmingReset && (
        <ConfirmResetModal onConfirm={confirmReset} onCancel={() => setConfirmingReset(false)} />
      )}

      <div
        ref={plotRef}
        className="relative overflow-hidden rounded-lg border-2 border-dashed border-(--brand-primary)/30 bg-(--surface-tint)"
        style={{ width: plotWidthCm * scale, height: plotLengthCm * scale }}
      >
        {onPlot.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-(--text-muted)">
            Nothing to place yet — add a growing area below
          </p>
        )}
        {onPlot.map(({ area, x, y, saved }) => {
          const rect = { x, y, type: area.type, ...footprintCm(area) };
          const overlapping = onPlot.some((other) => {
            if (other.area.id === area.id) return false;
            const otherRect = { x: other.x, y: other.y, type: other.area.type, ...footprintCm(other.area) };
            return isTooClose(rect, otherRect);
          });
          const shaded =
            !TALL_TYPES.includes(area.type) &&
            onPlot.some((other) => {
              if (other.area.id === area.id || !TALL_TYPES.includes(other.area.type)) return false;
              const otherWidth = footprintCm(other.area).widthCm;
              const xOverlap = Math.max(rect.x, other.x) < Math.min(rect.x + rect.widthCm, other.x + otherWidth);
              return xOverlap && other.y > rect.y && other.y - rect.y < SHADE_CHECK_DISTANCE_CM;
            });

          const emoji = area.occupant?.cropEmoji ?? growingAreaTypeEmoji[area.type];
          const label = area.occupant?.cropName ?? growingAreaTypeLabels[area.type];
          const size = sizeText(area);

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
              <span className="text-lg leading-none">{emoji}</span>
              {shaded && <span className="text-[10px] leading-none">🌥️</span>}
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
        it as it is. Pots and seed trays can sit right next to each other, but beds, raised beds, and
        planters need roughly {WALKWAY_CLEARANCE_CM}cm of walkway around them — a red outline means
        that&rsquo;s been broken (you can still leave it there, just watch for the warning). ☁️ means an
        area may be shaded by a taller one to the south.
      </p>

      <div className="rounded-lg border border-black/10 bg-white p-4 shadow-card">
        <p className="text-sm font-medium text-(--text-muted)">Not on your plot</p>
        {setAside.length === 0 ? (
          <p className="mt-2 text-sm text-(--text-muted)">Nothing set aside.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            {groupSetAside(setAside, overflowIds).map((group) => {
              const area = group.representative;
              const emoji = area.occupant?.cropEmoji ?? growingAreaTypeEmoji[area.type];
              const label = area.occupant?.cropName ?? growingAreaTypeLabels[area.type];
              const size = sizeText(area);
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
                  <span className="text-lg leading-none">{emoji}</span>
                  <span className="line-clamp-1 text-[10px] leading-none">{label}</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <AddAreaForm onAdded={(area) => setAreas((prev) => [...prev, area])} />
    </div>
  );
}
