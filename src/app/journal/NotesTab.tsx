"use client";

import { useActionState, useRef } from "react";
import { addNoteAction, type AddNoteState } from "@/lib/actions/notes";
import { LeafAccent } from "@/components/LeafAccent";
import { EntryCard } from "./EntryCard";
import type { JournalEntry, GrowingAreaOption } from "./types";

const initialState: AddNoteState = {};

function AddNoteForm({
  growingAreaOptions,
  onAdded,
}: {
  growingAreaOptions: GrowingAreaOption[];
  onAdded: (note: NonNullable<AddNoteState["note"]>) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: AddNoteState, formData: FormData) => {
    const result = await addNoteAction(prev, formData);
    if (result.note) {
      formRef.current?.reset();
      onAdded(result.note);
    }
    return result;
  }, initialState);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card"
    >
      <textarea
        name="body"
        required
        maxLength={2000}
        rows={3}
        placeholder="What's happening in your garden? e.g. soil in the raised bed looks dry, slugs on the lettuce…"
        className="rounded-md border border-black/15 px-3 py-2 text-sm"
      />
      {growingAreaOptions.length > 0 && (
        <select name="growingAreaId" defaultValue="" className="rounded-md border border-black/15 px-3 py-2 text-sm">
          <option value="">Tag with a growing area (optional)</option>
          {growingAreaOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" name="visibility" value="private" defaultChecked className="accent-(--brand-primary)" /> Just me
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="visibility" value="shared_tenant" className="accent-(--brand-primary)" /> Shared with everyone here
        </label>
      </div>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
      >
        {pending ? "Saving…" : "Add note"}
      </button>
    </form>
  );
}

export function NotesTab({
  notes,
  growingAreaOptions,
  tenantName,
  onAdded,
  onToggleVisibility,
  onDeleteNote,
}: {
  notes: JournalEntry[];
  growingAreaOptions: GrowingAreaOption[];
  tenantName: string;
  onAdded: (note: NonNullable<AddNoteState["note"]>) => void;
  onToggleVisibility: (entry: JournalEntry) => void;
  onDeleteNote: (noteId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <AddNoteForm growingAreaOptions={growingAreaOptions} onAdded={onAdded} />

      {notes.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
          <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
          <p className="text-sm text-(--text-muted)">No notes yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <EntryCard
              key={note.id}
              entry={note}
              tenantName={tenantName}
              paid={false}
              diagnosingId={null}
              diagnosesRemainingToday={0}
              onToggleVisibility={onToggleVisibility}
              onDiagnose={() => {}}
              onDeletePhoto={() => {}}
              onDeleteHarvest={() => {}}
              onDeleteNote={onDeleteNote}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
