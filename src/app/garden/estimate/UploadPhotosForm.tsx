"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import {
  uploadPhotosForEstimationAction,
  type UploadPhotosForEstimationState,
} from "@/lib/actions/growingAreaEstimation";
import { MAX_ESTIMATION_PHOTOS } from "@/lib/ai/limits";

const initialState: UploadPhotosForEstimationState = {};

// A modern phone photo can easily be 5-10MB+; a batch of MAX_ESTIMATION_
// PHOTOS of those blows straight through Next's Server Action body limit
// (1MB default — see next.config.ts for the raised ceiling, kept as
// headroom rather than the primary fix). Resizing client-side first keeps
// uploads fast and avoids that limit at the source; a vision model doesn't
// need full camera resolution to read a size reference or judge layout, so
// this costs nothing the AI estimate actually needs.
const MAX_DIMENSION_PX = 1600;
const JPEG_QUALITY = 0.8;

async function resizeImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;

    const name = file.name.replace(/\.[^./]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // A file this browser can't decode (rare, but real-world photo uploads
    // are unpredictable) — fall back to the original rather than blocking
    // the whole batch; server-side validation still catches anything the
    // upload action genuinely can't accept.
    return file;
  }
}

export function UploadPhotosForm() {
  const [state, formAction, pending] = useActionState(uploadPhotosForEstimationAction, initialState);
  const [resizing, setResizing] = useState(false);
  // useActionState's dispatch function has to be invoked inside a
  // transition — calling it directly from a plain async event handler
  // breaks more than just the `pending` flag: Next's Server Action
  // redirect() handling relies on running inside a proper transition too,
  // so without this the action could run but the redirect to the review
  // page would silently never happen.
  const [, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("photos") as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) return;

    // Already over the cap — let the existing server-side error message
    // handle it rather than spending time resizing photos that'll be
    // rejected anyway.
    if (files.length > MAX_ESTIMATION_PHOTOS) {
      const formData = new FormData();
      for (const file of files) formData.append("photos", file);
      startTransition(() => formAction(formData));
      return;
    }

    setResizing(true);
    const resized = await Promise.all(files.map(resizeImage));
    setResizing(false);

    const formData = new FormData();
    for (const file of resized) formData.append("photos", file);
    startTransition(() => formAction(formData));
  }

  const busy = resizing || pending;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card">
      <input
        name="photos"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        required
        className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-(--brand-primary) file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:opacity-90"
      />
      <p className="text-xs text-(--text-muted)">
        Up to {MAX_ESTIMATION_PHOTOS} photos. For more accurate size estimates, include something
        for scale in frame — a tape measure, a standard brick, or a pot you already know the size of.
      </p>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
      >
        {resizing ? "Preparing photos…" : pending ? "Uploading…" : "Estimate my growing areas"}
      </button>
    </form>
  );
}
