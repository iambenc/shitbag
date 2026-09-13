import Image from "next/image";
import Link from "next/link";
import { growingAreaTypeEmoji } from "@/lib/garden/labels";
import { GROWING_AREA_ILLUSTRATION_SRC } from "@/lib/garden/illustrations";
import type { MyGardenAreaCard } from "@/lib/garden/myGarden";

const CARD_CLASSNAME =
  "flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-card hover:border-(--brand-primary)/40 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200";

// Only structure cards render here — individual planting equipment (pots,
// trays, grow bags, planters) is deliberately left off this dashboard grid;
// it still exists on /garden's own "Your Plot" section, just not
// enumerated one card per item on the dashboard. Jumps straight to that
// structure's own section on /garden (#structure-{id}).
function StructureCard({ area }: { area: MyGardenAreaCard }) {
  const src = GROWING_AREA_ILLUSTRATION_SRC[area.type];
  return (
    <Link href={`/garden#structure-${area.id}`} className={CARD_CLASSNAME}>
      <div className="relative h-36 w-full shrink-0 bg-(--surface-tint)">
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-contain p-3"
          />
        ) : (
          <span aria-hidden className="absolute inset-0 flex items-center justify-center text-5xl">
            {growingAreaTypeEmoji[area.type]}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-base font-semibold">{area.displayLabel}</p>
          {area.pendingTaskCount > 0 ? (
            <span className="shrink-0 rounded-full bg-(--brand-secondary) px-2 py-0.5 text-xs font-medium text-(--text-heading)">
              {area.pendingTaskCount} task{area.pendingTaskCount === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-(--brand-primary)/10 px-2 py-0.5 text-xs font-medium text-(--brand-primary)">
              All good
            </span>
          )}
        </div>
        <p className="text-xs font-medium text-(--brand-primary)">
          🪴 {area.containedCount} item{area.containedCount === 1 ? "" : "s"} inside
        </p>
        <p className="text-xs text-(--text-muted)">
          {area.occupants.length > 0 ? area.occupants.map((o) => o.cropName).join(" · ") : "Nothing growing here yet."}
        </p>
      </div>
    </Link>
  );
}

// A fixed navigational shortcut, not a real growingArea — always present
// (even with nothing placed yet) so "Your Plot" is reachable from the
// dashboard regardless of what's owned, matching every structure card's
// clickable style.
function YourPlotCard({ itemCount }: { itemCount: number }) {
  return (
    <Link href="/garden#your-plot" className={CARD_CLASSNAME}>
      <div className="relative flex h-36 w-full shrink-0 items-center justify-center bg-(--surface-tint)">
        <span aria-hidden className="text-5xl">
          🌍
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="font-display text-base font-semibold">Your Plot</p>
        <p className="text-xs text-(--text-muted)">
          {itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"} placed` : "Nothing placed yet"}
        </p>
      </div>
    </Link>
  );
}

export function MyGardenGrid({ areas }: { areas: MyGardenAreaCard[] }) {
  // Structures get their own card; every other top-level card (individual
  // planting equipment) is folded into Your Plot's own item count instead
  // of being listed one-by-one here.
  const structureAreas = areas.filter((a) => a.containedCount !== undefined);
  const yourPlotItemCount = areas.length - structureAreas.length;

  return (
    <div className="rounded-lg border border-black/10 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold">My Garden</p>
        <Link href="/garden" className="text-sm text-(--brand-primary) underline">
          View all areas →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <YourPlotCard itemCount={yourPlotItemCount} />
        {structureAreas.map((area) => (
          <StructureCard key={area.id} area={area} />
        ))}
      </div>
    </div>
  );
}
