"use client";

import { useState } from "react";
import { dismissReportAction, unsharePhotoFromReportAction } from "@/lib/actions/admin";

type Report = {
  id: string;
  reason: string;
  createdAt: string;
  photoId: string;
  photoUrl: string;
  ownerEmail: string;
  reporterEmail: string;
};

export function ReportsView({ reports }: { reports: Report[] }) {
  const [handled, setHandled] = useState<Set<string>>(new Set());

  async function handleDismiss(reportId: string) {
    setHandled((prev) => new Set(prev).add(reportId));
    await dismissReportAction(reportId);
  }

  async function handleUnshare(photoId: string, reportIds: string[]) {
    setHandled((prev) => {
      const next = new Set(prev);
      reportIds.forEach((id) => next.add(id));
      return next;
    });
    await unsharePhotoFromReportAction(photoId);
  }

  const visible = reports.filter((r) => !handled.has(r.id));

  if (visible.length === 0) {
    return <p className="text-sm text-(--text-muted)">No pending reports.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {visible.map((report) => {
        const samePhotoIds = reports
          .filter((r) => r.photoId === report.photoId && !handled.has(r.id))
          .map((r) => r.id);
        return (
          <div key={report.id} className="flex flex-col gap-2 overflow-hidden rounded-lg border border-black/10 bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- locally-stored user upload, not an optimizable static asset */}
            <img src={report.photoUrl} alt="Reported photo" className="aspect-square w-full object-cover" />
            <div className="flex flex-col gap-1 p-3 text-xs">
              <p>
                <span className="font-medium">Owner:</span> {report.ownerEmail}
              </p>
              <p>
                <span className="font-medium">Reported by:</span> {report.reporterEmail}
              </p>
              <p>
                <span className="font-medium">Reason:</span> {report.reason}
              </p>
              <p className="text-(--text-muted)">{new Date(report.createdAt).toLocaleString("en-GB")}</p>
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={() => handleDismiss(report.id)} className="text-(--brand-primary) underline">
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => handleUnshare(report.photoId, samePhotoIds)}
                  className="text-red-700 underline"
                >
                  Unshare photo
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
