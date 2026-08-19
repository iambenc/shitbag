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
const WALKWAY_TYPES: GrowingAreaType[] = [
  "bed",
  "raised_bed",
  "planter",
  "greenhouse",
  "mini_greenhouse",
  "cold_frame",
];
export const WALKWAY_CLEARANCE_CM = 45;
export const DENSE_CLEARANCE_CM = 0;

export function requiredClearanceCm(type: GrowingAreaType): number {
  return WALKWAY_TYPES.includes(type) ? WALKWAY_CLEARANCE_CM : DENSE_CLEARANCE_CM;
}

// Beds, raised beds, and full greenhouses are physically built in place —
// dug into the ground, constructed from timber/stone, or installed on a
// permanent base like a shed — a real user can't just pick one up and move
// it, unlike a pot, seed tray, planter (heavy, but portable), or a
// mini-greenhouse/cold frame (explicitly sold as portable/foldable
// products). This is a different axis from WALKWAY_TYPES above (which is
// about clearance, not mobility) — deliberately excludes "planter"/
// "mini_greenhouse"/"cold_frame" here: they need a walkway like a bed does,
// but aren't nailed down the way a bed/raised_bed/greenhouse is. Used to
// decide which of a photo estimate's proposed positions get taken as real,
// confirmed placements versus left for the layout canvas to suggest — see
// confirmGrowingAreaProposalsAction.
export const FIXED_TYPES: GrowingAreaType[] = ["bed", "raised_bed", "greenhouse"];

export function isFixedType(type: GrowingAreaType): boolean {
  return FIXED_TYPES.includes(type);
}

// Only these three have a real, meaningful heightCm today — see the column
// comment on growingAreas.heightCm. Used by the equipment picker and every
// review/add form to decide whether to show a height input at all.
export const HEIGHT_TYPES: GrowingAreaType[] = ["greenhouse", "mini_greenhouse", "cold_frame"];

export function hasHeight(type: GrowingAreaType): boolean {
  return HEIGHT_TYPES.includes(type);
}

// depthCm is soil/growing-medium depth — meaningless for a ground-level bed
// (already excluded before HEIGHT_TYPES existed) and equally meaningless for
// a greenhouse/mini-greenhouse/cold frame, which are structures described
// fully by width, length, and height, not something a crop is planted
// directly into at a given depth. Used by the equipment picker and every
// review/add form to decide whether to show a depth input at all.
const NO_DEPTH_TYPES: GrowingAreaType[] = ["bed", ...HEIGHT_TYPES];

export function hasDepth(type: GrowingAreaType): boolean {
  return !NO_DEPTH_TYPES.includes(type);
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

// The one grid unit shared by both suggestion-scanning and user-facing
// snap-to-grid — findFreePosition below scans candidate spots in steps of
// this size (a simple, coarse trade-off between "finds a reasonably snug
// spot" and "doesn't need to check every single cm"), and the layout
// canvas's drag handler snaps a manually-dropped position to the same
// lattice (see snapToGrid) and renders visible grid lines at this spacing.
// One shared constant keeps every position on the canvas — suggested,
// snapped, or a mix — on the same grid, never subtly misaligned from each
// other. 15 divides WALKWAY_CLEARANCE_CM (45) evenly, so a walkway-type's
// edge clearance never itself knocks a suggested position off this grid.
export const GRID_CM = 15;

export function snapToGrid(valueCm: number): number {
  return Math.round(valueCm / GRID_CM) * GRID_CM;
}

// Rotation is always a multiple of 90° — cycles 0 → 90 → 180 → 270 → 0 on
// each click of the layout canvas's rotate control (see LayoutCanvas.tsx).
export function nextRotationDeg(rotationDeg: number): number {
  return (rotationDeg + 90) % 360;
}

// A rotation of 90 or 270 swaps which stored dimension (widthCm vs.
// lengthCm) acts as the on-canvas footprint's effective width vs. length;
// 0 and 180 are visually and functionally identical for a plain rectangle
// with no rendered front/back, so both leave the footprint unchanged.
export function rotatedFootprintCm(
  footprint: { widthCm: number; lengthCm: number },
  rotationDeg: number,
): { widthCm: number; lengthCm: number } {
  return rotationDeg % 180 === 90 ? { widthCm: footprint.lengthCm, lengthCm: footprint.widthCm } : footprint;
}

export type PositionedRect = { x: number; y: number; widthCm: number; lengthCm: number; type: GrowingAreaType };
export type PackableGrowingArea = {
  id: string;
  type: GrowingAreaType;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  rotationDeg: number;
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
  for (let y = edgeClearance; y + item.lengthCm + edgeClearance <= plotLengthCm; y += GRID_CM) {
    for (let x = edgeClearance; x + item.widthCm + edgeClearance <= plotWidthCm; x += GRID_CM) {
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
    .map((area) => ({ id: area.id, type: area.type, ...rotatedFootprintCm(footprintCm(area), area.rotationDeg) }))
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
