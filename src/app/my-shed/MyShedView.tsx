"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EquipmentPicker } from "@/components/EquipmentPicker";
import type { EquipmentState } from "@/lib/garden/equipmentRows";
import type { EquipmentCategory, SizeUnit } from "@/db/schema";
import { CONTAINER_SLUGS, SLUG_TO_GROWING_AREA_TYPE } from "@/lib/garden/equipmentMapping";
import { EquipmentIcon, GardenIcon, ShedIcon, TrowelIcon, DashboardIcon, PlusIcon, ChevronDownIcon } from "@/components/icons";
import { SeedsView } from "./SeedsView";
import { PlantingEquipmentTable } from "./PlantingEquipmentTable";
import { GardenStructuresGrid } from "./GardenStructuresGrid";
import { ToolsGrid } from "./ToolsGrid";
import { StatCards, type StatCard } from "./StatCards";
import type { ShedSeed, ShedEquipmentRow } from "./types";

type Tab = "seeds" | "planting" | "structures" | "tools";

const TAB_LABEL: Record<Tab, string> = {
  seeds: "Seeds",
  planting: "Planting equipment",
  structures: "Garden structures",
  tools: "Tools & equipment",
};

type EquipmentTypeInfo = {
  id: string;
  slug: string;
  name: string;
  category: EquipmentCategory;
  partnerLink: { label: string; url: string } | null;
};

type OwnedRowInput = {
  id: string;
  equipmentTypeId: string;
  quantity: number;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
  heightCm: number | null;
};

function isStructureSlug(slug: string): boolean {
  return slug in SLUG_TO_GROWING_AREA_TYPE && !CONTAINER_SLUGS.includes(slug);
}
function isContainerSlug(slug: string): boolean {
  return CONTAINER_SLUGS.includes(slug);
}

export function MyShedView({
  seeds,
  remainingToday,
  scansRemainingToday,
  cropNames,
  varietyNames,
  equipmentRows,
  equipmentTypes,
  equipmentAction,
}: {
  seeds: ShedSeed[];
  remainingToday: number;
  scansRemainingToday: number;
  cropNames: string[];
  varietyNames: string[];
  equipmentRows: ShedEquipmentRow[];
  equipmentTypes: EquipmentTypeInfo[];
  equipmentAction: (prevState: EquipmentState, formData: FormData) => Promise<EquipmentState>;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("seeds");
  const [editingEquipment, setEditingEquipment] = useState(false);
  const [addNewOpen, setAddNewOpen] = useState(false);
  const [seedFocusToken, setSeedFocusToken] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Owned here (not inside SeedsView) so the stat cards above can reflect
  // the same optimistic add/delete/quantity-edit updates live, not just the
  // static server props from first load. Same "sync when the prop identity
  // changes" pattern as TodayTasksCard.tsx, for the rare case a server
  // action elsewhere (or a plain navigation back to this page) hands down a
  // genuinely fresh `seeds` prop.
  const [prevSeedsProp, setPrevSeedsProp] = useState(seeds);
  const [seedList, setSeedList] = useState(seeds);
  if (seeds !== prevSeedsProp) {
    setPrevSeedsProp(seeds);
    setSeedList(seeds);
  }

  function goToTab(tab: Tab, opts?: { edit?: boolean; focusSeeds?: boolean }) {
    setActiveTab(tab);
    if (opts?.edit) setEditingEquipment(true);
    if (opts?.focusSeeds) setSeedFocusToken((t) => t + 1);
    setAddNewOpen(false);
    requestAnimationFrame(() => contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const containerRows = useMemo(() => equipmentRows.filter((r) => isContainerSlug(r.slug)), [equipmentRows]);
  const structureRows = useMemo(() => equipmentRows.filter((r) => isStructureSlug(r.slug)), [equipmentRows]);
  const toolRows = useMemo(
    () => equipmentRows.filter((r) => !isContainerSlug(r.slug) && !isStructureSlug(r.slug)),
    [equipmentRows],
  );

  // EquipmentPicker's own `rows` state is always seeded from the FULL
  // initialEquipmentRows below (never scoped) — only `types` narrows per
  // section, purely for which fieldsets render. That's what keeps this
  // scoping safe: applyEquipmentRows syncs a user's entire userEquipment set
  // to whatever comes back in the submission, so a section's edit form must
  // always carry every row along even for types it never renders, or saving
  // from (say) the Tools tab would silently delete every pot and greenhouse
  // the user owns (see equipmentRows.ts's own docblock).
  const editableTypes = useMemo(() => {
    if (activeTab === "planting") return equipmentTypes.filter((t) => isContainerSlug(t.slug));
    if (activeTab === "structures") return equipmentTypes.filter((t) => isStructureSlug(t.slug));
    if (activeTab === "tools") return equipmentTypes.filter((t) => !isContainerSlug(t.slug) && !isStructureSlug(t.slug));
    return equipmentTypes;
  }, [activeTab, equipmentTypes]);

  function sumQty(rows: ShedEquipmentRow[]) {
    return rows.reduce((sum, r) => sum + r.quantity, 0);
  }
  function distinctTypeCount(rows: ShedEquipmentRow[]) {
    return new Set(rows.map((r) => r.equipmentTypeId)).size;
  }

  const seedTypesCount = seedList.length;
  const totalKnownSeeds = seedList.reduce((sum, s) => sum + (s.seedCount ?? 0), 0);
  const containerTypesCount = distinctTypeCount(containerRows);
  const containerTotalQty = sumQty(containerRows);
  const structureTypesCount = distinctTypeCount(structureRows);
  const structureTotalQty = sumQty(structureRows);
  const toolTypesCount = distinctTypeCount(toolRows);
  const toolTotalQty = sumQty(toolRows);
  const allItemsCount = seedTypesCount + containerTotalQty + structureTotalQty + toolTotalQty;

  const statCards: StatCard[] = [
    {
      key: "seeds",
      icon: GardenIcon,
      label: "Seeds",
      primary: `${seedTypesCount} type${seedTypesCount === 1 ? "" : "s"}`,
      secondary: `${totalKnownSeeds} seeds`,
      viewLabel: "View seeds",
      onView: () => goToTab("seeds"),
    },
    {
      key: "planting",
      icon: EquipmentIcon,
      label: "Planting equipment",
      primary: `${containerTypesCount} type${containerTypesCount === 1 ? "" : "s"}`,
      secondary: `${containerTotalQty} total`,
      viewLabel: "View equipment",
      onView: () => goToTab("planting"),
    },
    {
      key: "structures",
      icon: ShedIcon,
      label: "Garden structures",
      primary: `${structureTypesCount} type${structureTypesCount === 1 ? "" : "s"}`,
      secondary: `${structureTotalQty} total`,
      viewLabel: "View structures",
      onView: () => goToTab("structures"),
    },
    {
      key: "tools",
      icon: TrowelIcon,
      label: "Tools & equipment",
      primary: `${toolTypesCount} type${toolTypesCount === 1 ? "" : "s"}`,
      secondary: `${toolTotalQty} total`,
      viewLabel: "View tools",
      onView: () => goToTab("tools"),
    },
    {
      key: "all",
      icon: DashboardIcon,
      label: "All items",
      primary: `${allItemsCount} items`,
      secondary: "Everything you own",
      viewLabel: "View all",
      onView: () => goToTab("seeds"),
    },
  ];

  const initialEquipmentRows: OwnedRowInput[] = equipmentRows.map((r) => ({
    id: r.id,
    equipmentTypeId: r.equipmentTypeId,
    quantity: r.quantity,
    sizeValue: r.sizeValue,
    sizeUnit: r.sizeUnit,
    widthCm: r.widthCm,
    lengthCm: r.lengthCm,
    depthCm: r.depthCm,
    heightCm: r.heightCm,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-semibold text-(--brand-primary)">
            My Shed <ShedIcon className="h-7 w-7" />
          </h1>
          <p className="mt-2 text-sm text-(--text-muted)">
            Everything you own for growing — seeds, equipment and more.
          </p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddNewOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-full bg-(--brand-primary) px-4 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
            aria-expanded={addNewOpen}
          >
            <PlusIcon className="h-4 w-4" />
            Add new
            <ChevronDownIcon className="h-4 w-4" />
          </button>
          {addNewOpen && (
            <div
              className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg"
              onMouseLeave={() => setAddNewOpen(false)}
            >
              <button
                type="button"
                onClick={() => goToTab("seeds", { focusSeeds: true })}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
              >
                Add seeds
              </button>
              <button
                type="button"
                onClick={() => goToTab("planting", { edit: true })}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
              >
                Add equipment
              </button>
            </div>
          )}
        </div>
      </div>

      <StatCards cards={statCards} />

      <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-display text-base font-semibold">Add seeds to your inventory</p>
          <p className="text-sm text-(--text-muted)">
            Take a photo of a seed packet to add it quickly, or add details manually.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => goToTab("seeds")}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
          >
            Scan a seed packet
          </button>
          <button
            type="button"
            onClick={() => goToTab("seeds", { focusSeeds: true })}
            className="rounded-md bg-(--brand-primary) px-4 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
          >
            Add manually
          </button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-black/10 pb-px">
        {(Object.keys(TAB_LABEL) as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => goToTab(tab)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "border-(--brand-primary) text-(--brand-primary)"
                : "border-transparent text-(--text-muted) hover:text-(--text-heading)"
            }`}
          >
            {TAB_LABEL[tab]}
          </button>
        ))}
      </div>

      <div ref={contentRef} className="scroll-mt-6">
        {activeTab === "seeds" && (
          <SeedsView
            seeds={seedList}
            onSeedsChange={setSeedList}
            remainingToday={remainingToday}
            scansRemainingToday={scansRemainingToday}
            cropNames={cropNames}
            varietyNames={varietyNames}
            focusToken={seedFocusToken}
          />
        )}
        {activeTab === "planting" && (
          <PlantingEquipmentTable rows={containerRows} onEdit={() => setEditingEquipment(true)} />
        )}
        {activeTab === "structures" && (
          <div className="flex flex-col gap-6">
            <GardenStructuresGrid rows={structureRows} />
            <button
              type="button"
              onClick={() => setEditingEquipment(true)}
              className="self-start rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5"
            >
              Edit equipment
            </button>
          </div>
        )}
        {activeTab === "tools" && <ToolsGrid rows={toolRows} onEdit={() => setEditingEquipment(true)} />}

        {activeTab !== "seeds" && editingEquipment && (
          <div className="mt-8 border-t border-black/10 pt-8">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-display text-lg font-semibold">Edit equipment</p>
              <button type="button" onClick={() => setEditingEquipment(false)} className="text-sm text-(--text-muted) underline">
                Close
              </button>
            </div>
            <p className="mb-4 text-sm text-(--text-muted)">
              {activeTab === "tools" ? (
                "Everything you use in the garden, separate from the growing space itself."
              ) : (
                <>
                  Newly added growing-space equipment is automatically ready to plant in on{" "}
                  <Link href="/garden" className="text-(--brand-primary) underline">
                    your garden layout
                  </Link>
                  .
                </>
              )}
            </p>
            <EquipmentPicker
              types={editableTypes}
              initialRows={initialEquipmentRows}
              action={equipmentAction}
              submitLabel="Save equipment"
              pendingLabel="Saving…"
            />
          </div>
        )}
      </div>
    </div>
  );
}
