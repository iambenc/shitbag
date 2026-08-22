import Image from "next/image";
import Link from "next/link";
import { growingAreaTypeEmoji } from "@/lib/garden/labels";
import { GROWING_AREA_ILLUSTRATION_SRC } from "@/lib/garden/illustrations";
import type { MyGardenAreaCard } from "@/lib/garden/myGarden";

function AreaCard({ area }: { area: MyGardenAreaCard }) {
  const src = GROWING_AREA_ILLUSTRATION_SRC[area.type];
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-card">
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
        <p className="text-xs text-(--text-muted)">
          {area.occupants.length > 0 ? area.occupants.map((o) => o.cropName).join(" · ") : "Nothing growing here yet."}
        </p>
      </div>
    </div>
  );
}

export function MyGardenGrid({ areas }: { areas: MyGardenAreaCard[] }) {
  return (
    <div className="rounded-lg border border-black/10 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="font-display text-lg font-semibold">My Garden</p>
        <Link href="/garden" className="text-sm text-(--brand-primary) underline">
          View all areas →
        </Link>
      </div>

      {areas.length === 0 ? (
        <p className="mt-4 text-sm text-(--text-muted)">
          You haven&rsquo;t added any growing areas yet.{" "}
          <Link href="/garden" className="text-(--brand-primary) underline">
            Add one
          </Link>{" "}
          to get started.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {areas.map((area) => (
            <AreaCard key={area.id} area={area} />
          ))}
        </div>
      )}
    </div>
  );
}
