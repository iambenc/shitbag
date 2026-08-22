import type { EquipmentCategory, SizeUnit, CropCategory } from "@/db/schema";

export type ShedSeed = {
  id: string;
  cropName: string;
  cropEmoji: string;
  cropCategory: CropCategory;
  varietyName: string | null;
  quantityLabel: string;
  seedCount: number | null;
  source: "onboarding" | "purchased" | "shopping_list";
  addedIso: string;
};

export type ShedEquipmentRow = {
  id: string;
  equipmentTypeId: string;
  slug: string;
  typeName: string;
  category: EquipmentCategory;
  quantity: number;
  sizeValue: number | null;
  sizeUnit: SizeUnit | null;
  widthCm: number | null;
  lengthCm: number | null;
  depthCm: number | null;
  heightCm: number | null;
};
