"use client";

import { useActionState, useRef, useState } from "react";
import {
  uploadPhotoAction,
  setPhotoVisibilityAction,
  deletePhotoAction,
  type UploadPhotoState,
} from "@/lib/actions/photos";

type Photo = {
  id: string;
  url: string;
  caption: string | null;
  visibility: "private" | "shared_tenant";
  ownerEmail: string;
  isOwn: boolean;
};

const initialState: UploadPhotoState = {};

function UploadForm({ onUploaded }: { onUploaded: (photo: NonNullable<UploadPhotoState["photo"]>) => void }) {
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
      className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4"
    >
      <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required />
      <input
        name="caption"
        type="text"
        placeholder="Caption (optional)"
        className="rounded-md border border-black/15 px-3 py-2 text-sm"
      />
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" name="visibility" value="private" defaultChecked /> Just me
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="visibility" value="shared_tenant" /> Shared with everyone here
        </label>
      </div>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-4 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload photo"}
      </button>
    </form>
  );
}

export function JournalView({
  myPhotos,
  sharedPhotos,
  tenantName,
  currentUserEmail,
}: {
  myPhotos: Photo[];
  sharedPhotos: Photo[];
  tenantName: string;
  currentUserEmail: string;
}) {
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const [mine, setMine] = useState(myPhotos);
  const [shared, setShared] = useState(sharedPhotos);

  function handleUploaded(photo: NonNullable<UploadPhotoState["photo"]>) {
    const asPhoto: Photo = { ...photo, ownerEmail: currentUserEmail, isOwn: true };
    setMine((ps) => [asPhoto, ...ps]);
    if (photo.visibility === "shared_tenant") {
      setShared((ps) => [asPhoto, ...ps]);
    }
  }

  async function handleToggleVisibility(photo: Photo) {
    const visibility = photo.visibility === "private" ? "shared_tenant" : "private";
    setMine((ps) => ps.map((p) => (p.id === photo.id ? { ...p, visibility } : p)));
    setShared((ps) =>
      visibility === "shared_tenant"
        ? [{ ...photo, visibility }, ...ps.filter((p) => p.id !== photo.id)]
        : ps.filter((p) => p.id !== photo.id),
    );
    await setPhotoVisibilityAction(photo.id, visibility);
  }

  async function handleDelete(photoId: string) {
    setMine((ps) => ps.filter((p) => p.id !== photoId));
    setShared((ps) => ps.filter((p) => p.id !== photoId));
    await deletePhotoAction(photoId);
  }

  return (
    <div className="flex flex-col gap-8">
      <UploadForm onUploaded={handleUploaded} />

      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`rounded-full px-3 py-1 ${tab === "mine" ? "bg-(--brand-primary) text-white" : "border border-black/15"}`}
        >
          My Photos
        </button>
        <button
          type="button"
          onClick={() => setTab("shared")}
          className={`rounded-full px-3 py-1 ${tab === "shared" ? "bg-(--brand-primary) text-white" : "border border-black/15"}`}
        >
          Shared in {tenantName}
        </button>
      </div>

      {tab === "mine" ? (
        mine.length === 0 ? (
          <p className="text-sm text-[#1f2a1f]/60">No photos yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {mine.map((photo) => (
              <div key={photo.id} className="flex flex-col gap-1 overflow-hidden rounded-lg border border-black/10 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- locally-stored user upload, not an optimizable static asset */}
                <img src={photo.url} alt={photo.caption ?? "Garden photo"} className="aspect-square w-full object-cover" />
                <div className="flex flex-col gap-1 p-2 text-xs">
                  {photo.caption && <p>{photo.caption}</p>}
                  <button type="button" onClick={() => handleToggleVisibility(photo)} className="text-left text-(--brand-primary) underline">
                    {photo.visibility === "private" ? "Private — share it" : "Shared — make private"}
                  </button>
                  <button type="button" onClick={() => handleDelete(photo.id)} className="text-left text-[#1f2a1f]/50 hover:text-red-700">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : shared.length === 0 ? (
        <p className="text-sm text-[#1f2a1f]/60">No one has shared a photo yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {shared.map((photo) => (
            <div key={photo.id} className="flex flex-col gap-1 overflow-hidden rounded-lg border border-black/10 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- locally-stored user upload, not an optimizable static asset */}
              <img src={photo.url} alt={photo.caption ?? "Garden photo"} className="aspect-square w-full object-cover" />
              <div className="flex flex-col gap-1 p-2 text-xs">
                {photo.caption && <p>{photo.caption}</p>}
                <p className="text-[#1f2a1f]/50">{photo.isOwn ? "You" : photo.ownerEmail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
