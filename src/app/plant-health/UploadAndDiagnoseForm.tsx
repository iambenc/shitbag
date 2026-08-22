"use client";

import { useActionState } from "react";
import { uploadAndDiagnoseAction, type UploadAndDiagnoseState } from "@/lib/actions/plantHealth";

const initialState: UploadAndDiagnoseState = {};

export function UploadAndDiagnoseForm({
  growingAreaId,
  taskId,
  areaLabel,
}: {
  growingAreaId?: string;
  taskId?: string;
  areaLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(uploadAndDiagnoseAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white p-4 shadow-card">
      {areaLabel && <p className="text-sm font-medium text-(--text-heading)">For: {areaLabel}</p>}
      {growingAreaId && <input type="hidden" name="growingAreaId" value={growingAreaId} />}
      {taskId && <input type="hidden" name="taskId" value={taskId} />}
      <input
        name="photo"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        required
        className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-(--brand-primary) file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:opacity-90"
      />
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-(--brand-primary) px-6 py-2 text-sm text-white shadow-button hover:brightness-90 active:scale-95 transition disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload & diagnose"}
      </button>
    </form>
  );
}
