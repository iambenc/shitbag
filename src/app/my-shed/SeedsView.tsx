"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import {
  addSeedAction,
  deleteSeedAction,
  scanSeedPacketAction,
  updateSeedCountAction,
  type AddSeedState,
  type SeedPacketScanClientResult,
} from "@/lib/actions/seeds";
import { LeafAccent } from "@/components/LeafAccent";
import { LoadingInterstitial } from "@/components/LoadingInterstitial";
import { MoreIcon } from "@/components/icons";
import type { ShedSeed } from "./types";

const MAX_SUGGESTIONS = 8;
const SHOWN_BY_DEFAULT = 5;

const CROP_CATEGORY_LABEL: Record<ShedSeed["cropCategory"], string> = {
  fruit: "Fruit",
  vegetable: "Vegetable",
  herb: "Herb",
};

// Replaces a native <datalist> dropdown (which some browsers render as a
// full unstyled list of every option, unfiltered, rather than narrowing as
// you type) with a small in-input autocomplete: filters `options` against
// the current text, shows a short styled dropdown below the field. Used for
// both the crop name (required) and the variety name (optional) inputs.
// `initialValue` (only read once, on mount) is what lets a packet scan
// pre-fill this field — see ScanPacketButton / SeedsView's resetToken.
function AutocompleteTextField({
  name,
  options,
  required,
  placeholder,
  className,
  initialValue,
  inputRef,
}: {
  name: string;
  options: string[];
  required?: boolean;
  placeholder: string;
  className?: string;
  initialValue?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return [];
    return options.filter((name) => name.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS);
  }, [value, options]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function choose(name: string) {
    setValue(name);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <input
        ref={inputRef}
        name={name}
        type="text"
        required={required}
        maxLength={100}
        autoComplete="off"
        placeholder={placeholder}
        className="w-full rounded-md border border-black/15 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlighted((i) => (i + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlighted((i) => (i - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(matches[highlighted]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-black/10 bg-white text-sm shadow-card">
          {matches.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(name)}
                className={`block w-full px-3 py-2 text-left ${
                  i === highlighted ? "bg-(--surface-tint) text-(--brand-primary)" : "hover:bg-(--surface-tint)"
                }`}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Uploads a photo straight to scanSeedPacketAction and hands the extracted
// fields back to the parent to pre-fill the form below — nothing is saved
// here, this is purely an autofill step (see scanSeedPacketAction's own
// comment: the user reviews/edits everything before addSeedAction ever
// writes anything). `capture="environment"` hints mobile browsers to open
// the camera directly rather than a file picker, matching "photo of a
// packet you're holding" rather than "a file already on disk". No real
// barcode/UPC decoding exists anywhere in this app — this is AI photo-OCR,
// so the button is deliberately worded "Scan a seed packet", not
// "barcode", to match what it actually does.
function ScanPacketButton({
  onScanned,
  remainingToday,
}: {
  onScanned: (result: SeedPacketScanClientResult) => void;
  remainingToday: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.append("photo", file);
    const result = await scanSeedPacketAction(formData);
    setPending(false);
    if (inputRef.current) inputRef.current.value = "";
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.scan) onScanned(result.scan);
  }

  if (remainingToday <= 0) {
    return <p className="text-xs text-(--text-muted)">You&rsquo;ve scanned the most packets you can for today.</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {pending && <LoadingInterstitial message="Reading your seed packet…" />}
      <input
        ref={inputRef}
        id="seed-packet-photo"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        disabled={pending}
        className="hidden"
      />
      <label
        htmlFor="seed-packet-photo"
        className={`inline-flex w-fit items-center gap-2 self-start rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition ${
          pending ? "opacity-60" : "cursor-pointer hover:bg-black/5 active:scale-95"
        }`}
      >
        📷 {pending ? "Reading packet…" : "Scan a seed packet"}
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-(--text-muted)">{remainingToday} scans left today</p>
    </div>
  );
}

// Click-to-edit quantity, inline in the row rather than a separate form —
// this is a quick correction (used some seeds outside the app, or turning
// an onboarding row's vague "1 packet" into a real count), not a full
// re-add. 0 is a valid, submittable value (see updateSeedCountAction's own
// comment on why it isn't treated as "delete this row").
function EditableQuantity({
  seedId,
  quantityLabel,
  seedCount,
  onUpdated,
}: {
  seedId: string;
  quantityLabel: string;
  seedCount: number | null;
  onUpdated: (quantityLabel: string, seedCount: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(seedCount != null ? String(seedCount) : "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setEditing(false);
    setValue(seedCount != null ? String(seedCount) : "");
    setError(null);
  }

  async function save() {
    const parsedValue = Number(value);
    setPending(true);
    setError(null);
    const result = await updateSeedCountAction(seedId, parsedValue);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.quantityLabel) {
      onUpdated(result.quantityLabel, parsedValue);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="underline decoration-dotted underline-offset-2 hover:text-(--brand-primary)"
        aria-label={`Edit quantity: ${quantityLabel}`}
      >
        {quantityLabel}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <input
        type="number"
        min={0}
        max={100000}
        step={1}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            cancel();
          }
        }}
        className="w-20 rounded-md border border-black/15 px-2 py-0.5 text-sm"
      />
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="text-xs text-(--brand-primary) underline disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={cancel} className="text-xs text-(--text-muted) underline">
        Cancel
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

// The "···" actions menu, wrapping Delete — same overflow-menu pattern as
// the calendar redesign's TaskCard.tsx, so a row's destructive action isn't
// a bare always-visible button.
function RowActionsMenu({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-1.5 text-(--text-muted) hover:bg-black/5"
        aria-label={`More actions for ${label}`}
        aria-expanded={open}
      >
        <MoreIcon className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-32 overflow-hidden rounded-lg border border-black/10 bg-white py-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            aria-label={`Delete ${label}`}
            className="block w-full px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

type ScanValues = {
  cropName: string;
  varietyName: string;
  seedCount: string;
  seedCountIsEstimate: boolean;
  notes: string | null;
};

const initialState: AddSeedState = {};

export function SeedsView({
  seeds,
  onSeedsChange,
  remainingToday,
  scansRemainingToday,
  cropNames,
  varietyNames,
  focusToken,
}: {
  seeds: ShedSeed[];
  // Seeds is a controlled list, owned by MyShedView (not local state here) —
  // its stat cards need to reflect the same live add/delete/quantity-edit
  // optimism this view already applies, not the stale initial server props.
  onSeedsChange: (updater: (seeds: ShedSeed[]) => ShedSeed[]) => void;
  remainingToday: number;
  scansRemainingToday: number;
  cropNames: string[];
  varietyNames: string[];
  // Bumped by MyShedView (e.g. from the header's "+ Add new" dropdown or the
  // top promo banner) to scroll to and focus this form from elsewhere on the
  // page, without this component needing to know why.
  focusToken?: number;
}) {
  const [scanValues, setScanValues] = useState<ScanValues | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Both autocomplete inputs (and, once scanned, the seed-count input too)
  // are either controlled or need a fresh initial value, so — unlike a
  // plain uncontrolled input — they won't reset/refill themselves via
  // React's automatic form-reset behaviour. Remounting them via a changing
  // `key` is the simplest way to reset (after a successful add) or refill
  // (after a successful scan) their initial state together.
  const [resetToken, setResetToken] = useState(0);
  const cropFieldRef = useRef<HTMLInputElement>(null);
  const [state, formAction] = useActionState(async (prev: AddSeedState, formData: FormData) => {
    const result = await addSeedAction(prev, formData);
    if (result.seed) {
      onSeedsChange((ss) => [
        {
          id: result.seed!.id,
          cropName: result.seed!.cropName,
          cropEmoji: result.seed!.cropEmoji,
          cropCategory: result.seed!.cropCategory,
          varietyName: result.seed!.varietyName,
          quantityLabel: result.seed!.quantityLabel,
          seedCount: result.seed!.seedCount,
          source: "purchased",
          addedIso: new Date().toISOString().slice(0, 10),
        },
        ...ss,
      ]);
      setScanValues(null);
      setResetToken((t) => t + 1);
    }
    return result;
  }, initialState);

  useEffect(() => {
    if (focusToken) cropFieldRef.current?.focus();
  }, [focusToken]);

  async function handleDelete(id: string) {
    onSeedsChange((ss) => ss.filter((s) => s.id !== id));
    await deleteSeedAction(id);
  }

  function handleQuantityUpdated(id: string, quantityLabel: string, seedCount: number) {
    onSeedsChange((ss) => ss.map((s) => (s.id === id ? { ...s, quantityLabel, seedCount } : s)));
  }

  function handleScanned(scan: SeedPacketScanClientResult) {
    setScanValues({
      cropName: scan.cropName,
      varietyName: scan.varietyName ?? "",
      seedCount: scan.seedCount != null ? String(scan.seedCount) : "",
      seedCountIsEstimate: scan.seedCountIsEstimate,
      notes: scan.notes,
    });
    setResetToken((t) => t + 1);
  }

  const visible = showAll ? seeds : seeds.slice(0, SHOWN_BY_DEFAULT);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Seeds</h2>
        <p className="text-sm text-(--text-muted)">Track your seed packets and quantities.</p>
      </div>

      {seeds.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
          <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
          <p className="text-sm text-(--text-muted)">Nothing in your seed inventory yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 bg-white shadow-card">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs text-(--text-muted)">
                <th className="px-4 py-3 font-medium">Seed</th>
                <th className="px-4 py-3 font-medium">Variety</th>
                <th className="px-4 py-3 font-medium">Quantity</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((seed) => (
                <tr key={seed.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="text-xl">
                        {seed.cropEmoji}
                      </span>
                      <div>
                        <p className="font-medium">{seed.cropName}</p>
                        <p className="text-xs text-(--text-muted)">{CROP_CATEGORY_LABEL[seed.cropCategory]}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-(--text-muted)">{seed.varietyName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <EditableQuantity
                      seedId={seed.id}
                      quantityLabel={seed.quantityLabel}
                      seedCount={seed.seedCount}
                      onUpdated={(quantityLabel, seedCount) => handleQuantityUpdated(seed.id, quantityLabel, seedCount)}
                    />
                  </td>
                  <td className="px-4 py-3 text-(--text-muted)">{seed.addedIso}</td>
                  <td className="px-4 py-3">
                    <RowActionsMenu label={seed.cropName} onDelete={() => handleDelete(seed.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {seeds.length > SHOWN_BY_DEFAULT && (
            <div className="flex items-center justify-between border-t border-black/10 px-4 py-3 text-xs text-(--text-muted)">
              <span>
                Showing {visible.length} of {seeds.length} seeds
              </span>
              <button type="button" onClick={() => setShowAll((s) => !s)} className="text-(--brand-primary) underline">
                {showAll ? "Show less" : "View all seeds"}
              </button>
            </div>
          )}
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card">
        <ScanPacketButton onScanned={handleScanned} remainingToday={scansRemainingToday} />
        {scanValues && (
          <p className="text-sm text-(--brand-primary)">
            Filled in from your photo — check these before adding.
            {scanValues.seedCountIsEstimate && scanValues.seedCount ? " Seed count is an estimate." : ""}
            {scanValues.notes ? ` ${scanValues.notes}` : ""}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <AutocompleteTextField
            key={resetToken}
            inputRef={cropFieldRef}
            name="cropName"
            options={cropNames}
            required
            placeholder="What did you buy? e.g. Tomato, or something unusual"
            className="min-w-[16rem] flex-1"
            initialValue={scanValues?.cropName}
          />
          <AutocompleteTextField
            key={`variety-${resetToken}`}
            name="varietyName"
            options={varietyNames}
            placeholder="Variety, e.g. Moneymaker (optional)"
            className="min-w-48 flex-1"
            initialValue={scanValues?.varietyName}
          />
          <input
            key={`count-${resetToken}`}
            name="seedCount"
            type="number"
            required
            min={1}
            max={100000}
            step={1}
            placeholder="How many seeds?"
            defaultValue={scanValues?.seedCount}
            className="w-40 rounded-md border border-black/15 px-3 py-2 text-sm"
          />
        </div>
        {state.error && <p className="text-sm text-red-700">{state.error}</p>}
        {state.seed?.cropIsNew && (
          <p className="text-sm text-(--brand-primary)">
            {state.seed.cropEmoji} {state.seed.cropName} wasn&rsquo;t in our catalog — added it using an
            AI-estimated best guess at its growing facts.
          </p>
        )}
        {state.seed?.varietyIsNew && (
          <p className="text-sm text-(--brand-primary)">
            {state.seed.varietyName} wasn&rsquo;t a variety we knew about for {state.seed.cropName} — added it
            using an AI-estimated best guess too.
          </p>
        )}
        {remainingToday > 0 ? (
          <>
            <button
              type="submit"
              className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition"
            >
              Add to inventory
            </button>
            <p className="text-xs text-(--text-muted)">{remainingToday} additions left today</p>
          </>
        ) : (
          <p className="text-xs text-(--text-muted)">
            You&rsquo;ve added the most you can for today — come back tomorrow.
          </p>
        )}
      </form>
    </div>
  );
}
