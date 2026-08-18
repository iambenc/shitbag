import type { GrowingAreaType, SizeUnit } from "@/db/schema";

// Beds, raised beds, and planters need a walkway around them so a person
// can actually reach in and tend them; pots and seed trays are small
// enough to sit right up against their neighbours. A pair's required gap
// is the larger of what either side needs (see pairClearanceCm) — a
// walkway-requiring item still needs its walkway even if the thing next to
// it is a pot, not the other way round. A fixed policy constant rather
// than a user setting, matching this codebase's other fixed policy numbers
// (e.g. MAX_DAILY_GROW_PLAN_GENERATIONS) rather than adding UI complexity
// for something a sensible default already covers.
const WALKWAY_TYPES: GrowingAreaType[] = ["bed", "raised_bed", "planter"];
export const WALKWAY_CLEARANCE_CM = 45;
export const DENSE_CLEARANCE_CM = 0;

export function requiredClearanceCm(type: GrowingAreaType): number {
  return WALKWAY_TYPES.includes(type) ? WALKWAY_CLEARANCE_CM : DENSE_CLEARANCE_CM;
}

function pairClearanceCm(a: { type: GrowingAreaType }, b: { type: GrowingAreaType }): number {
  return Math.max(requiredClearanceCm(a.type), requiredClearanceCm(b.type));
}

// A generic "medium pot" footprint for anything with no width/length AND
// no cm-diameter sizeValue to fall back on (e.g. a pot sized only in
// litres) — matches the layout canvas's card-size fallback spirit: never
// crash or omit an item just because its exact footprint isn't knowable,
// just render/place it at a reasonable default size.
const DEFAULT_FOOTPRINT_CM = 30;

// Grid resolution for scanning candidate positions in findFreePosition — a
// simple, coarse trade-off between "finds a reasonably snug spot" and
// "doesn't need to check every single cm."
const SCAN_STEP_CM = 15;

export type PositionedRect = { x: number; y: number; widthCm: number; lengthCm: number; type: GrowingAreaType };
export type PackableGrowingArea = {
  id: string;
  type: GrowingAreaType;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
};
export type PackedPosition = { id: string; x: number; y: number };
export type PackResult = { placed: PackedPosition[]; overflow: string[] };

// A pot/seed tray's real footprint is round, but a square of the same
// diameter is a fine, simple stand-in for placement/collision purposes —
// this app doesn't model circular footprints anywhere else either.
export function footprintCm(area: {
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
}): { widthCm: number; lengthCm: number } {
  if (area.widthCm && area.lengthCm) return { widthCm: area.widthCm, lengthCm: area.lengthCm };
  if (area.sizeValue && area.sizeUnit === "cm") return { widthCm: area.sizeValue, lengthCm: area.sizeValue };
  return { widthCm: DEFAULT_FOOTPRINT_CM, lengthCm: DEFAULT_FOOTPRINT_CM };
}

/**
 * True if two footprints, placed at the given top-left positions, come
 * closer than their pair's required clearance (see pairClearanceCm) — or
 * overlap outright. Far enough apart means at least that much separation
 * along EITHER axis; a negative gap means the rects actually overlap along
 * that axis, which certainly isn't "far enough" either. A soft
 * warn-don't-block signal for the drag canvas: a user can always drag a
 * bed right up against another item despite the walkway requirement (item
 * dimensions are themselves already approximate, so hard-blocking on
 * imprecise geometry would be frustrating), they just see a warning when
 * they do.
 */
export function isTooClose(a: PositionedRect, b: PositionedRect): boolean {
  const requiredCm = pairClearanceCm(a, b);
  const xGap = Math.max(a.x, b.x) - Math.min(a.x + a.widthCm, b.x + b.widthCm);
  const yGap = Math.max(a.y, b.y) - Math.min(a.y + a.lengthCm, b.y + b.lengthCm);
  return xGap < requiredCm && yGap < requiredCm;
}

/**
 * Scans for the first free spot (row-major, top-left to bottom-right) that
 * fits `item`'s footprint without violating its required clearance against
 * anything in `occupied` or the plot edge. Never moves anything already in
 * `occupied` — that set represents real, already-decided positions (either
 * saved, or another suggestion already placed earlier in the same pass).
 * Returns null if nothing fits anywhere.
 */
export function findFreePosition(
  plotWidthCm: number,
  plotLengthCm: number,
  item: { type: GrowingAreaType; widthCm: number; lengthCm: number },
  occupied: PositionedRect[],
): { x: number; y: number } | null {
  const edgeClearance = requiredClearanceCm(item.type);
  if (item.widthCm + 2 * edgeClearance > plotWidthCm || item.lengthCm + 2 * edgeClearance > plotLengthCm) {
    return null;
  }
  for (let y = edgeClearance; y + item.lengthCm + edgeClearance <= plotLengthCm; y += SCAN_STEP_CM) {
    for (let x = edgeClearance; x + item.widthCm + edgeClearance <= plotWidthCm; x += SCAN_STEP_CM) {
      const candidate: PositionedRect = { x, y, widthCm: item.widthCm, lengthCm: item.lengthCm, type: item.type };
      if (!occupied.some((rect) => isTooClose(candidate, rect))) {
        return { x, y };
      }
    }
  }
  return null;
}

/**
 * Suggests in-memory-only positions for every area in `unplaced`, treating
 * `alreadyPlaced` as fixed (real, saved positions — never moved). Beds,
 * raised beds, and planters are placed before any pot/seed tray — they're
 * pickier about clearance (see requiredClearanceCm), so giving them first
 * claim on the plot's space avoids pots getting suggested into spots that
 * then force a bed's walkway requirement into a corner, or into overflow
 * outright. Within that priority tier, biggest footprint goes first.
 * Placed one at a time, each newly-suggested item joining the occupied set
 * for the next, so two suggestions never land on top of each other. Purely
 * a proposal: nothing here writes to the database — see LayoutCanvas.tsx
 * for how a suggestion becomes real (the user drags it, which saves it)
 * versus stays a proposal the user is free to ignore.
 */
export function suggestPositions(
  plotWidthCm: number,
  plotLengthCm: number,
  alreadyPlaced: PositionedRect[],
  unplaced: PackableGrowingArea[],
): PackResult {
  const occupied = [...alreadyPlaced];
  const placed: PackedPosition[] = [];
  const overflow: string[] = [];

  const sized = unplaced
    .map((area) => ({ id: area.id, type: area.type, ...footprintCm(area) }))
    .sort((a, b) => {
      const priorityDiff = requiredClearanceCm(b.type) - requiredClearanceCm(a.type);
      return priorityDiff !== 0 ? priorityDiff : b.widthCm * b.lengthCm - a.widthCm * a.lengthCm;
    });

  for (const area of sized) {
    const spot = findFreePosition(plotWidthCm, plotLengthCm, area, occupied);
    if (!spot) {
      overflow.push(area.id);
      continue;
    }
    placed.push({ id: area.id, x: spot.x, y: spot.y });
    occupied.push({ ...spot, widthCm: area.widthCm, lengthCm: area.lengthCm, type: area.type });
  }

  return { placed, overflow };
}
