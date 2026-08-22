"use client";

import Link from "next/link";
import { TrashIcon } from "@/components/icons";
import { LeafAccent } from "@/components/LeafAccent";
import type { HarvestRow } from "./types";

export function HarvestsTab({ harvests, onDelete }: { harvests: HarvestRow[]; onDelete: (harvestId: string) => void }) {
  if (harvests.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
        <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
        <p className="text-sm text-(--text-muted)">
          Nothing logged yet — record a harvest from{" "}
          <Link href="/harvests" className="text-(--brand-primary) underline">
            the harvests page
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 bg-white shadow-card">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead>
          <tr className="border-b border-black/10 text-xs text-(--text-muted)">
            <th className="px-4 py-3 font-medium">Crop</th>
            <th className="px-4 py-3 font-medium">Quantity</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {harvests.map((h) => (
            <tr key={h.id} className="border-b border-black/5 last:border-0">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="text-xl">
                    {h.cropEmoji}
                  </span>
                  <div>
                    <p className="font-medium">{h.cropName}</p>
                    {h.varietyName && <p className="text-xs text-(--text-muted)">{h.varietyName}</p>}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                {h.quantity}
                {h.unit}
              </td>
              <td className="px-4 py-3 text-(--text-muted)">{h.harvestedAt}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onDelete(h.id)}
                  aria-label={`Delete ${h.cropName} harvest`}
                  className="rounded-full p-1.5 text-(--text-muted) hover:bg-red-50 hover:text-red-700"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
