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

export const equipmentTypeSeeds: EquipmentTypeSeed[] = [
  { slug: "watering-can", name: "Watering Can", category: "count", partnerLinkLabel: "Shop watering cans", partnerLinkUrl: "https://example.com/partner/watering-can" },
  { slug: "seed-trays", name: "Seed Trays", category: "count", partnerLinkLabel: "Shop seed trays", partnerLinkUrl: "https://example.com/partner/seed-trays" },
  { slug: "pots", name: "Pots", category: "sized", partnerLinkLabel: "Shop plant pots", partnerLinkUrl: "https://example.com/partner/pots" },
  { slug: "planters", name: "Planters", category: "dimensions", partnerLinkLabel: "Shop planters", partnerLinkUrl: "https://example.com/partner/planters" },
  { slug: "raised-beds", name: "Raised Beds", category: "dimensions", partnerLinkLabel: "Shop raised beds", partnerLinkUrl: "https://example.com/partner/raised-beds" },
  { slug: "garden-beds", name: "Garden Beds", category: "dimensions", partnerLinkLabel: "Shop bed edging & tools", partnerLinkUrl: "https://example.com/partner/garden-beds" },
];
