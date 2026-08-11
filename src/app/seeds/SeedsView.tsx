"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { addSeedAction, deleteSeedAction, type AddSeedState } from "@/lib/actions/seeds";
import { LeafAccent } from "@/components/LeafAccent";

const MAX_SUGGESTIONS = 8;

// Replaces the native <datalist> dropdown (which some browsers render as a
// full unstyled list of every option, unfiltered, rather than narrowing as
// you type) with a small in-input autocomplete: filters cropNames against
// the current text, shows a short styled dropdown below the field.
function CropNameField({ cropNames }: { cropNames: string[] }) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return [];
    return cropNames.filter((name) => name.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS);
  }, [value, cropNames]);

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
    <div ref={containerRef} className="relative min-w-[16rem] flex-1">
      <input
        name="cropName"
        type="text"
        required
        maxLength={100}
        autoComplete="off"
        placeholder="What did you buy? e.g. Tomato, or something unusual"
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

type Seed = {
  id: string;
  cropName: string;
  cropEmoji: string;
  quantityLabel: string;
  source: "onboarding" | "purchased";
};

const initialState: AddSeedState = {};

export function SeedsView({
  seeds,
  remainingToday,
  cropNames,
}: {
  seeds: Seed[];
  remainingToday: number;
  cropNames: string[];
}) {
  const [list, setList] = useState(seeds);
  // CropNameField's input is controlled (needed for the filtered dropdown),
  // so — unlike the plain seedCount input next to it — it won't clear itself
  // via React 19's automatic uncontrolled-field form reset after a
  // successful submit. Remounting it via a changing `key` on each success is
  // the simplest way to reset its internal state along with the rest of the form.
  const [resetToken, setResetToken] = useState(0);
  const [state, formAction] = useActionState(async (prev: AddSeedState, formData: FormData) => {
    const result = await addSeedAction(prev, formData);
    if (result.seed) {
      setList((ss) => [
        {
          id: result.seed!.id,
          cropName: result.seed!.cropName,
          cropEmoji: result.seed!.cropEmoji,
          quantityLabel: result.seed!.quantityLabel,
          source: "purchased",
        },
        ...ss,
      ]);
      setResetToken((t) => t + 1);
    }
    return result;
  }, initialState);

  async function handleDelete(id: string) {
    setList((ss) => ss.filter((s) => s.id !== id));
    await deleteSeedAction(id);
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        {list.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
            <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
            <p className="text-sm text-(--text-muted)">Nothing in your seed inventory yet.</p>
          </div>
        )}
        {list.map((seed) => (
          <div
            key={seed.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white p-3 shadow-card"
          >
            <span className="text-sm">
              {seed.cropEmoji} {seed.cropName} · {seed.quantityLabel}
            </span>
            <button
              type="button"
              onClick={() => handleDelete(seed.id)}
              className="text-xs text-(--text-muted) hover:text-red-700"
              aria-label={`Delete ${seed.cropName}`}
            >
              Delete
            </button>
          </div>
        ))}
      </section>

      <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card">
        <div className="flex flex-wrap gap-2">
          <CropNameField key={resetToken} cropNames={cropNames} />
          <input
            name="seedCount"
            type="number"
            required
            min={1}
            max={100000}
            step={1}
            placeholder="How many seeds?"
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
