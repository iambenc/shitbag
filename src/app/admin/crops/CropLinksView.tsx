"use client";

import { CropLinkRow, type Variety } from "./CropLinkRow";

type Crop = { id: string; slug: string; name: string; emoji: string };
type PartnerLink = { id: string; cropId: string; label: string; url: string };

export function CropLinksView({
  crops,
  links,
  varietiesByCropId,
}: {
  crops: Crop[];
  links: PartnerLink[];
  varietiesByCropId: Record<string, Variety[]>;
}) {
  return (
    <div className="flex flex-col gap-4">
      {crops.map((crop) => (
        <CropLinkRow
          key={crop.id}
          crop={crop}
          links={links.filter((l) => l.cropId === crop.id)}
          varieties={varietiesByCropId[crop.id] ?? []}
        />
      ))}
    </div>
  );
}
