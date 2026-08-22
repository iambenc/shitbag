import Link from "next/link";
import { WarningIcon } from "@/components/icons";
import type { GardenHealthSummary } from "@/lib/garden/health";

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Growing-area-based, driven by each area's latest real plant-health
// diagnosis (see health.ts). Each segment carries a direct count+label, not
// color-only identity. needs_attention uses a true red (not terracotta) to
// match severityBadgeClasses' own "high" severity badge on /plant-health
// (bg-red-200/text-red-800) — the donut's color language matches that
// page's badges exactly, not just internally.
export function GardenHealthCard({ summary }: { summary: GardenHealthSummary }) {
  const { counts, highlight } = summary;
  const total = counts.healthy + counts.monitor + counts.needs_attention;

  const segments = [
    { key: "healthy" as const, count: counts.healthy, color: "var(--brand-primary)", label: "Healthy" },
    { key: "monitor" as const, count: counts.monitor, color: "var(--brand-secondary)", label: "Monitor" },
    { key: "needs_attention" as const, count: counts.needs_attention, color: "#dc2626", label: "Needs attention" },
  ];

  let offset = 0;
  const arcs = segments.map((s) => {
    const length = total > 0 ? (s.count / total) * CIRCUMFERENCE : 0;
    const arc = { ...s, length, offset };
    offset += length;
    return arc;
  });

  return (
    <div className="rounded-lg border border-black/10 bg-white p-5 shadow-card">
      <p className="font-display text-lg font-semibold">Garden health</p>

      {total === 0 ? (
        <p className="mt-4 text-sm text-(--text-muted)">
          Once you complete a weekly photo health check for a growing area, its status will show up here.
        </p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-6">
            <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0" aria-hidden="true">
              <g style={{ transform: "rotate(-90deg)", transformOrigin: "60px 60px" }}>
                <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="var(--surface-tint)" strokeWidth="14" />
                {arcs
                  .filter((a) => a.count > 0)
                  .map((a) => (
                    <circle
                      key={a.key}
                      cx="60"
                      cy="60"
                      r={RADIUS}
                      fill="none"
                      stroke={a.color}
                      strokeWidth="14"
                      strokeDasharray={`${a.length} ${CIRCUMFERENCE - a.length}`}
                      strokeDashoffset={-a.offset}
                    />
                  ))}
              </g>
              <text x="60" y="56" textAnchor="middle" fill="var(--text-heading)" fontSize="22" fontWeight="600">
                {total}
              </text>
              <text x="60" y="74" textAnchor="middle" fill="var(--text-muted)" fontSize="10">
                Areas
              </text>
            </svg>
            <ul className="flex flex-col gap-1.5 text-sm">
              {segments.map((s) => (
                <li key={s.key} className="flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span>
                    {s.count} {s.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {highlight && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-red-50 px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <WarningIcon className="h-4 w-4 shrink-0 text-red-600" />
                <span className="truncate">
                  {highlight.areaLabel}: {highlight.issue}
                </span>
              </span>
              <Link href="/plant-health" className="shrink-0 text-(--brand-primary) underline">
                View diagnosis →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
