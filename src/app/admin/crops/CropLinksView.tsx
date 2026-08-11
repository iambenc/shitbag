"use client";

import { CropLinkRow } from "./CropLinkRow";

type Crop = { id: string; slug: string; name: string; emoji: string };
type PartnerLink = { id: string; cropId: string; label: string; url: string };

export function CropLinksView({ crops, links }: { crops: Crop[]; links: PartnerLink[] }) {
  return (
    <div className="flex flex-col gap-4">
      {crops.map((crop) => (
        <CropLinkRow key={crop.id} crop={crop} links={links.filter((l) => l.cropId === crop.id)} />
      ))}
    </div>
  );
}
