"use client";

import { useActionState, useRef, useState } from "react";
import {
  uploadPhotoAction,
  setPhotoVisibilityAction,
  deletePhotoAction,
  type UploadPhotoState,
} from "@/lib/actions/photos";
import { diagnoseExistingPhotoAction, reportPhotoAction } from "@/lib/actions/plantHealth";
import { LeafAccent } from "@/components/LeafAccent";
import { EyeIcon, TrashIcon } from "@/components/icons";

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

export function JournalView({
  myPhotos,
  sharedPhotos,
  tenantName,
  currentUserEmail,
  paid,
  diagnosesRemainingToday,
}: {
  myPhotos: Photo[];
  sharedPhotos: Photo[];
  tenantName: string;
  currentUserEmail: string;
  paid: boolean;
  diagnosesRemainingToday: number;
}) {
  const [tab, setTab] = useState<"mine" | "shared">("mine");
  const [mine, setMine] = useState(myPhotos);
  const [shared, setShared] = useState(sharedPhotos);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [diagnosingId, setDiagnosingId] = useState<string | null>(null);

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

  async function handleDiagnose(photoId: string) {
    setDiagnosingId(photoId);
    await diagnoseExistingPhotoAction(photoId);
    setDiagnosingId(null);
  }

  async function handleReport(photoId: string) {
    const reason = window.prompt("Why are you reporting this photo?");
    if (!reason) return;
    await reportPhotoAction(photoId, reason);
    setReportedIds((prev) => new Set(prev).add(photoId));
  }

  return (
    <div className="flex flex-col gap-8">
      <UploadForm onUploaded={handleUploaded} />

      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`rounded-full px-3 py-1 transition ${tab === "mine" ? "bg-(--brand-primary) text-white shadow-button" : "bg-black/5 text-(--text-muted) hover:bg-black/10"}`}
        >
          My Photos
        </button>
        <button
          type="button"
          onClick={() => setTab("shared")}
          className={`rounded-full px-3 py-1 transition ${tab === "shared" ? "bg-(--brand-primary) text-white shadow-button" : "bg-black/5 text-(--text-muted) hover:bg-black/10"}`}
        >
          Shared in {tenantName}
        </button>
      </div>

      {tab === "mine" ? (
        mine.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-(--surface-tint) p-3">
            <LeafAccent className="h-5 w-5 shrink-0 text-(--brand-primary)" />
            <p className="text-sm text-(--text-muted)">No photos yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {mine.map((photo) => (
              <div key={photo.id} className="group flex flex-col gap-1 overflow-hidden rounded-lg border border-black/10 bg-white shadow-card">
                <div className="relative aspect-square w-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element -- locally-stored user upload, not an optimizable static asset */}
                  <img src={photo.url} alt={photo.caption ?? "Garden photo"} className="h-full w-full object-cover" />

                  <span
                    className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white"
                    title={photo.visibility === "private" ? "Only visible to you" : `Shared with everyone in ${tenantName}`}
                  >
                    <EyeIcon className="h-3 w-3 shrink-0" />
                    {photo.visibility === "private" ? "Private" : "Shared"}
                  </span>

                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => handleToggleVisibility(photo)}
                      className="rounded-full bg-white/90 p-2 hover:bg-white active:scale-95 transition"
                      aria-label={photo.visibility === "private" ? "Share this photo" : "Make this photo private"}
                      title={photo.visibility === "private" ? "Share" : "Make private"}
                    >
                      <EyeIcon className="h-4 w-4 text-(--text-heading)" />
                    </button>
                    {paid && (
                      <button
                        type="button"
                        onClick={() => handleDiagnose(photo.id)}
                        disabled={diagnosingId !== null || diagnosesRemainingToday === 0}
                        className="rounded-full bg-white/90 p-2 hover:bg-white active:scale-95 transition disabled:opacity-50"
                        aria-label="Diagnose this plant"
                        title={diagnosesRemainingToday === 0 ? "No plant checks left today" : diagnosingId === photo.id ? "Diagnosing…" : "Diagnose"}
                      >
                        <LeafAccent className="h-4 w-4 text-(--brand-primary)" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(photo.id)}
                      className="rounded-full bg-white/90 p-2 hover:bg-red-100 active:scale-95 transition"
                      aria-label="Delete this photo"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4 text-red-700" />
                    </button>
                  </div>
                </div>
                {photo.caption && <p className="p-2 text-xs">{photo.caption}</p>}
              </div>
            ))}
          </div>
        )
      ) : shared.length === 0 ? (
        <p className="text-sm text-(--text-muted)">No one has shared a photo yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {shared.map((photo) => (
            <div key={photo.id} className="flex flex-col gap-1 overflow-hidden rounded-lg border border-black/10 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- locally-stored user upload, not an optimizable static asset */}
              <img src={photo.url} alt={photo.caption ?? "Garden photo"} className="aspect-square w-full object-cover" />
              <div className="flex flex-col gap-1 p-2 text-xs">
                {photo.caption && <p>{photo.caption}</p>}
                <p className="text-(--text-muted)">{photo.isOwn ? "You" : photo.ownerEmail}</p>
                {!photo.isOwn && (
                  reportedIds.has(photo.id) ? (
                    <p className="text-(--text-muted)">Reported</p>
                  ) : (
                    <button type="button" onClick={() => handleReport(photo.id)} className="text-left text-(--text-muted) hover:text-red-700">
                      Report
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
