"use client";

import { useActionState } from "react";
import { createCropPartnerLinkAction, deletePartnerLinkAction, type ActionState } from "@/lib/actions/admin";

const initialState: ActionState = {};

type Crop = { id: string; slug: string; name: string; emoji: string };
type PartnerLink = { id: string; cropId: string; label: string; url: string };
export type Variety = {
  id: string;
  name: string;
  growthHabit: string | null;
  diseaseResistanceNotes: string | null;
  characteristics: string | null;
  verified: boolean;
};

export function CropLinkRow({ crop, links, varieties }: { crop: Crop; links: PartnerLink[]; varieties: Variety[] }) {
  const [linkState, linkAction, linkPending] = useActionState(createCropPartnerLinkAction, initialState);

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 shadow-card">
      <p className="font-medium">
        {crop.emoji} {crop.name} <span className="text-xs text-(--text-muted)">({crop.slug})</span>
      </p>

      {/* Read-only: same "the shared catalog can't be edited here" boundary
          the page's own intro copy already draws for crops themselves —
          varieties are the same shared, cross-tenant table (see
          crop_varieties' own schema comment), populated organically via user
          input / AI backfill / the curated seed data, not managed from this
          admin page. */}
      <div className="mt-3 border-t border-black/10 pt-3">
        <p className="text-xs font-medium text-(--text-muted)">Varieties ({varieties.length})</p>
        {varieties.length === 0 ? (
          <p className="mt-2 text-sm text-(--text-muted)">None recorded yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {varieties.map((v) => (
              <li key={v.id} className="text-sm">
                <span className="font-medium">{v.name}</span>
                {!v.verified && (
                  <span
                    className="ml-2 rounded-full bg-(--color-terracotta)/15 px-2 py-0.5 text-xs text-(--color-terracotta)"
                    title="Added by AI and hasn't been reviewed yet."
                  >
                    Unverified
                  </span>
                )}
                {(v.growthHabit || v.diseaseResistanceNotes || v.characteristics) && (
                  <p className="text-xs text-(--text-muted)">
                    {[v.growthHabit, v.diseaseResistanceNotes, v.characteristics].filter(Boolean).join(" — ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 border-t border-black/10 pt-3">
        <p className="text-xs font-medium text-(--text-muted)">Partner links</p>
        <ul className="mt-2 flex flex-col gap-1">
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between text-sm">
              <a href={link.url} target="_blank" rel="noreferrer" className="text-(--brand-primary) underline">
                {link.label}
              </a>
              <button
                type="button"
                onClick={() => deletePartnerLinkAction(link.id)}
                className="text-xs text-(--text-muted) hover:text-red-700"
              >
                Remove
              </button>
            </li>
          ))}
          {links.length === 0 && <li className="text-sm text-(--text-muted)">No partner links yet.</li>}
        </ul>
        <form action={linkAction} className="mt-2 flex flex-wrap gap-2">
          <input type="hidden" name="cropId" value={crop.id} />
          <input name="label" placeholder="Label" required className="rounded-md border border-black/15 px-2 py-1 text-sm" />
          <input
            name="url"
            type="url"
            placeholder="https://..."
            required
            className="rounded-md border border-black/15 px-2 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={linkPending}
            className="rounded-full border border-(--brand-primary)/30 px-3 py-1 text-xs hover:bg-(--brand-primary)/10 disabled:opacity-60"
          >
            {linkPending ? "Adding…" : "Add link"}
          </button>
        </form>
        {linkState.error && <p className="mt-1 text-sm text-red-700">{linkState.error}</p>}
      </div>
    </div>
  );
}
