import type { EquipmentCategory } from "@/db/schema";

/**
 * Core equipment types from the onboarding spec. `partnerLinkLabel`/Url are
 * placeholder example.com links — there's no real affiliate programme yet
 * (open item in docs/plan.md); this exercises the "recommended equipment"
 * link-out UI with something clearly non-production.
 */
export type EquipmentTypeSeed = {
  slug: string;
  name: string;
  category: EquipmentCategory;
  partnerLinkLabel: string;
  partnerLinkUrl: string;
};

// Garden tools — hand/hand-held equipment used *on* a growing area, never
// itself a growing area (unlike the "planting equipment" types below, none
// of these appear in SLUG_TO_GROWING_AREA_TYPE, so EquipmentPicker's
// tool/planting-equipment split is derived from that same map rather than
// needing a redundant "kind" column here). All "count" category — a simple
// quantity-owned checklist, no size/dimensions to capture for a trowel.
const GARDEN_TOOL_SEEDS: EquipmentTypeSeed[] = [
  { slug: "watering-can", name: "Watering Can", category: "count", partnerLinkLabel: "Shop watering cans", partnerLinkUrl: "https://example.com/partner/watering-can" },
  { slug: "hand-trowel", name: "Hand Trowel", category: "count", partnerLinkLabel: "Shop hand trowels", partnerLinkUrl: "https://example.com/partner/hand-trowel" },
  { slug: "hand-fork", name: "Hand Fork", category: "count", partnerLinkLabel: "Shop hand forks", partnerLinkUrl: "https://example.com/partner/hand-fork" },
  { slug: "secateurs", name: "Secateurs", category: "count", partnerLinkLabel: "Shop secateurs", partnerLinkUrl: "https://example.com/partner/secateurs" },
  { slug: "garden-gloves", name: "Garden Gloves", category: "count", partnerLinkLabel: "Shop garden gloves", partnerLinkUrl: "https://example.com/partner/garden-gloves" },
  { slug: "spade", name: "Digging Spade", category: "count", partnerLinkLabel: "Shop digging spades", partnerLinkUrl: "https://example.com/partner/spade" },
  { slug: "garden-fork", name: "Digging Fork", category: "count", partnerLinkLabel: "Shop digging forks", partnerLinkUrl: "https://example.com/partner/garden-fork" },
  { slug: "rake", name: "Garden Rake", category: "count", partnerLinkLabel: "Shop garden rakes", partnerLinkUrl: "https://example.com/partner/rake" },
  { slug: "hoe", name: "Garden Hoe", category: "count", partnerLinkLabel: "Shop garden hoes", partnerLinkUrl: "https://example.com/partner/hoe" },
  { slug: "wheelbarrow", name: "Wheelbarrow", category: "count", partnerLinkLabel: "Shop wheelbarrows", partnerLinkUrl: "https://example.com/partner/wheelbarrow" },
];

// Planting equipment — physical growing space (see SLUG_TO_GROWING_AREA_TYPE
// in equipmentMapping.ts, the single source of truth for which of these
// slugs map to which growingAreaTypeEnum value).
const PLANTING_EQUIPMENT_SEEDS: EquipmentTypeSeed[] = [
  { slug: "seed-trays", name: "Seed Trays", category: "count", partnerLinkLabel: "Shop seed trays", partnerLinkUrl: "https://example.com/partner/seed-trays" },
  { slug: "pots", name: "Pots", category: "sized", partnerLinkLabel: "Shop plant pots", partnerLinkUrl: "https://example.com/partner/pots" },
  { slug: "planters", name: "Planters", category: "dimensions", partnerLinkLabel: "Shop planters", partnerLinkUrl: "https://example.com/partner/planters" },
  { slug: "raised-beds", name: "Raised Beds", category: "dimensions", partnerLinkLabel: "Shop raised beds", partnerLinkUrl: "https://example.com/partner/raised-beds" },
  { slug: "garden-beds", name: "Garden Beds", category: "dimensions", partnerLinkLabel: "Shop bed edging & tools", partnerLinkUrl: "https://example.com/partner/garden-beds" },
];

export const equipmentTypeSeeds: EquipmentTypeSeed[] = [...GARDEN_TOOL_SEEDS, ...PLANTING_EQUIPMENT_SEEDS];
