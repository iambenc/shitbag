"use client";

import { useState } from "react";
import Link from "next/link";
import { syncGrowingAreasAction, assignEquipmentToStructureAction } from "@/lib/actions/garden/syncGrowingAreas";
import { growingAreaTypeEmoji, formatSizeValue } from "@/lib/garden/labels";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import type { GrowingAreaType, SizeUnit } from "@/db/schema";

type StructureInfo = { id: string; type: GrowingAreaType; displayLabel: string };

type ContainerRow = {
  userEquipmentId: string;
  name: string;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
  heightCm: number | null;
  quantityOwned: number;
  // Both real counts of actual growingAreas rows, not derived — see
  // page.tsx's own comment on why. mainGardenCount = placed but not inside
  // any structure (parentGrowingAreaId IS NULL); assignedByStructure = per
  // structure id.
  mainGardenCount: number;
  assignedByStructure: Record<string, number>;
};

function sizeText(row: Pick<ContainerRow, "sizeValue" | "sizeUnit" | "widthCm" | "lengthCm" | "depthCm" | "heightCm">) {
  const sized = formatSizeValue(row.sizeValue, row.sizeUnit);
  const dims = sized ?? (row.widthCm && row.lengthCm ? `${row.widthCm}×${row.lengthCm}${row.depthCm ? `×${row.depthCm}` : ""}cm` : null);
  if (dims && row.heightCm) return `${dims}, ${row.heightCm}cm tall`;
  return dims;
}

const EMPTY_CONTAINERS_MESSAGE = (
  <p className="text-sm text-(--text-muted)">You haven&apos;t recorded any pots, trays, planters, or beds yet.</p>
);

function Stepper({
  label,
  value,
  max,
  pending,
  onChange,
  decrementLabel,
  incrementLabel,
}: {
  label: string;
  value: number;
  max: number;
  pending: boolean;
  onChange: (desired: number) => void;
  decrementLabel: string;
  incrementLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= 0 || pending}
        aria-label={decrementLabel}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 hover:bg-black/10 active:scale-95 transition disabled:opacity-40"
      >
        –
      </button>
      <span className="w-20 text-center text-sm">
        {value} {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max || pending}
        aria-label={incrementLabel}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-(--brand-primary) text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}

export function GrowingAreaManager({
  containers: initialContainers,
  structures,
}: {
  containers: ContainerRow[];
  structures: StructureInfo[];
}) {
  const [containers, setContainers] = useState(initialContainers);
  // Resyncs when the parent Server Component re-renders with a fresh
  // `containers` prop (e.g. after a My Shed save calls revalidatePath) —
  // same "adjusting state when a prop changes" pattern this component
  // already established (see the prior version's identical comment).
  const [prevContainers, setPrevContainers] = useState(initialContainers);
  if (initialContainers !== prevContainers) {
    setPrevContainers(initialContainers);
    setContainers(initialContainers);
  }
  // Keyed by `${userEquipmentId}:${scope}` ("main" or a structure id) so
  // two different steppers for the same equipment (main garden vs. a
  // structure) never disable each other while one is mid-request.
  const [pending, setPending] = useState<string | null>(null);
  // Same key scheme as `pending` — set when a decrement couldn't be fully
  // honored (the server only ever removes `status: "available"` rows,
  // never one actively growing something) so the count silently reverting
  // toward its old value has a visible explanation instead of just looking
  // broken. Cleared at the start of the next change to that same stepper.
  const [blockedWarning, setBlockedWarning] = useState<{ key: string; message: string } | null>(null);

  // How much of this row's owned quantity is committed everywhere EXCEPT
  // `scope` — every stepper's own max bound, and Inventory's remaining
  // figure, are both just quantityOwned minus this, read live off the one
  // shared `containers` array. That's what makes every section react to
  // every other section's changes in the same render, with no server round
  // trip needed for the numbers to move.
  function allocatedOutside(row: ContainerRow, scope: "main" | string): number {
    let total = scope === "main" ? 0 : row.mainGardenCount;
    for (const structure of structures) {
      if (structure.id !== scope) total += row.assignedByStructure[structure.id] ?? 0;
    }
    return total;
  }

  async function changeMainGarden(userEquipmentId: string, desired: number) {
    const key = `${userEquipmentId}:main`;
    const previous = containers.find((c) => c.userEquipmentId === userEquipmentId)?.mainGardenCount ?? 0;
    setBlockedWarning(null);
    setContainers((cs) => cs.map((c) => (c.userEquipmentId === userEquipmentId ? { ...c, mainGardenCount: desired } : c)));
    setPending(key);
    const result = await syncGrowingAreasAction(userEquipmentId, desired);
    setPending(null);
    const finalCount = result.ok ? result.count : previous;
    setContainers((cs) => cs.map((c) => (c.userEquipmentId === userEquipmentId ? { ...c, mainGardenCount: finalCount } : c)));
    // Only a decrement can be silently short-changed (growth always fully
    // succeeds up to the owned quantity) — a lower `desired` that came back
    // higher than asked means some rows couldn't be freed.
    if (result.ok && desired < previous && finalCount > desired) {
      setBlockedWarning({ key, message: "Some are currently growing something and can't be removed right now." });
    }
  }

  async function changeStructureAssignment(userEquipmentId: string, structureId: string, desired: number) {
    const key = `${userEquipmentId}:${structureId}`;
    const previous = containers.find((c) => c.userEquipmentId === userEquipmentId)?.assignedByStructure[structureId] ?? 0;
    setBlockedWarning(null);
    setContainers((cs) =>
      cs.map((c) =>
        c.userEquipmentId === userEquipmentId
          ? { ...c, assignedByStructure: { ...c.assignedByStructure, [structureId]: desired } }
          : c,
      ),
    );
    setPending(key);
    const result = await assignEquipmentToStructureAction(userEquipmentId, structureId, desired);
    setPending(null);
    const finalCount = result.ok ? result.count : previous;
    setContainers((cs) =>
      cs.map((c) =>
        c.userEquipmentId === userEquipmentId
          ? { ...c, assignedByStructure: { ...c.assignedByStructure, [structureId]: finalCount } }
          : c,
      ),
    );
    if (result.ok && desired < previous && finalCount > desired) {
      setBlockedWarning({ key, message: "Some are currently growing something and can't be removed right now." });
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section id="your-plot" className="flex flex-col gap-4 scroll-mt-6">
        <h2 className="text-sm font-medium text-(--text-muted)">Your Plot</h2>
        {containers.length === 0 && EMPTY_CONTAINERS_MESSAGE}
        {containers.map((row) => {
          const size = sizeText(row);
          const max = row.quantityOwned - allocatedOutside(row, "main");
          const key = `${row.userEquipmentId}:main`;
          return (
            <div
              key={row.userEquipmentId}
              id={`equipment-${row.userEquipmentId}`}
              className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-4 shadow-card scroll-mt-6"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">
                    {row.name}
                    {size && <span className="text-(--text-muted)"> · {size}</span>}
                  </p>
                  <p className="text-xs text-(--text-muted)">You own {row.quantityOwned}</p>
                </div>
                <Stepper
                  label="placed"
                  value={row.mainGardenCount}
                  max={max}
                  pending={pending === key}
                  onChange={(desired) => changeMainGarden(row.userEquipmentId, desired)}
                  decrementLabel={`Remove one placed ${row.name}`}
                  incrementLabel={`Add one placed ${row.name}`}
                />
              </div>
              {blockedWarning?.key === key && <p className="text-xs text-red-700">{blockedWarning.message}</p>}
            </div>
          );
        })}
      </section>

      {structures.map((structure) => (
        <section key={structure.id} id={`structure-${structure.id}`} className="flex flex-col gap-4 scroll-mt-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-(--text-muted)">
              {growingAreaTypeEmoji[structure.type]} {structure.displayLabel}
            </h2>
            {FEATURE_FLAGS.layoutPlanning && (
              <Link href={`/garden/layout/${structure.id}`} className="text-xs text-(--brand-primary) underline">
                Arrange inside →
              </Link>
            )}
          </div>
          {containers.length === 0 ? (
            <p className="text-sm text-(--text-muted)">
              You don&rsquo;t own any pots, trays, grow bags, or planters yet — add some in{" "}
              <Link href="/my-shed" className="text-(--brand-primary) underline">
                My Shed
              </Link>
              .
            </p>
          ) : (
            containers.map((row) => {
              const size = sizeText(row);
              const value = row.assignedByStructure[structure.id] ?? 0;
              const max = row.quantityOwned - allocatedOutside(row, structure.id);
              const key = `${row.userEquipmentId}:${structure.id}`;
              return (
                <div
                  key={row.userEquipmentId}
                  className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-4 shadow-card"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium">
                      {row.name}
                      {size && <span className="text-(--text-muted)"> · {size}</span>}
                    </p>
                    <Stepper
                      label="inside"
                      value={value}
                      max={max}
                      pending={pending === key}
                      onChange={(desired) => changeStructureAssignment(row.userEquipmentId, structure.id, desired)}
                      decrementLabel={`Remove one ${row.name} from ${structure.displayLabel}`}
                      incrementLabel={`Add one ${row.name} to ${structure.displayLabel}`}
                    />
                  </div>
                  {blockedWarning?.key === key && <p className="text-xs text-red-700">{blockedWarning.message}</p>}
                </div>
              );
            })
          )}
        </section>
      ))}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-(--text-muted)">Inventory</h2>
        {containers.length === 0 ? (
          EMPTY_CONTAINERS_MESSAGE
        ) : (
          <div className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-4 shadow-card">
            {containers.map((row) => {
              const size = sizeText(row);
              const allocated = row.mainGardenCount + Object.values(row.assignedByStructure).reduce((sum, n) => sum + n, 0);
              const remaining = row.quantityOwned - allocated;
              return (
                <div key={row.userEquipmentId} className="flex items-center justify-between gap-4 text-sm">
                  <p>
                    {row.name}
                    {size && <span className="text-(--text-muted)"> · {size}</span>}
                  </p>
                  <p className="text-(--text-muted)">{remaining} remaining</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {FEATURE_FLAGS.layoutPlanning && (
        <Link
          href="/garden/layout"
          className="flex items-center gap-2 rounded-lg border border-black/10 bg-white p-4 shadow-card hover:border-(--brand-primary)/40 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200"
        >
          <div>
            <p className="font-display text-lg font-semibold">🗺️ Plan your layout</p>
            <p className="mt-1 text-sm text-(--text-muted)">
              See your plot from above and drag your growing areas into place.
            </p>
          </div>
        </Link>
      )}
    </div>
  );
}
