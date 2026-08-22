"use client";

import { useActionState, useRef } from "react";
import { uploadPhotoAction, type UploadPhotoState } from "@/lib/actions/photos";
import type { GrowingAreaOption } from "./types";

const initialState: UploadPhotoState = {};

// Lifted out of the old monolithic JournalView.tsx unchanged (same fields,
// same uploadPhotoAction) — now toggle-revealed from the header's "+ Add
// journal entry" button instead of always-on, matching My Shed's "+ Add
// new" reveal pattern.
export function UploadForm({
  growingAreaOptions,
  onUploaded,
}: {
  growingAreaOptions: GrowingAreaOption[];
  onUploaded: (photo: NonNullable<UploadPhotoState["photo"]>) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: UploadPhotoState, formData: FormData) => {
    const result = await uploadPhotoAction(prev, formData);
    if (result.photo) {
      formRef.current?.reset();
      onUploaded(result.photo);
    }
    return result;
  }, initialState);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card"
    >
      <input
        name="photo"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        required
        className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-(--brand-primary) file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:opacity-90"
      />
      <input
        name="caption"
        type="text"
        placeholder="Caption (optional)"
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
        {pending ? "Uploading…" : "Upload photo"}
      </button>
    </form>
  );
}
