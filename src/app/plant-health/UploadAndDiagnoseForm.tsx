"use client";

import { useActionState } from "react";
import { uploadAndDiagnoseAction, type UploadAndDiagnoseState } from "@/lib/actions/plantHealth";

const initialState: UploadAndDiagnoseState = {};

export function UploadAndDiagnoseForm() {
  const [state, formAction, pending] = useActionState(uploadAndDiagnoseAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4">
      <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required />
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload & diagnose"}
      </button>
    </form>
  );
}
