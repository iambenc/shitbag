import { eq, and, inArray, desc } from "drizzle-orm";
import type { Database } from "@/db/client";
import { growingAreas, photoJournalEntries, plantDiagnoses } from "@/db/schema";
import type { PlantDiagnosisSeverity } from "@/db/schema";
import { growingAreaBaseLabel } from "@/lib/garden/labels";

export type GardenHealthBucket = "healthy" | "monitor" | "needs_attention";

export type GardenHealthHighlight = {
  areaId: string;
  areaLabel: string;
  issue: string;
};

export type GardenHealthSummary = {
  counts: Record<GardenHealthBucket, number>;
  highlight: GardenHealthHighlight | null;
};

const EMPTY_SUMMARY: GardenHealthSummary = {
  counts: { healthy: 0, monitor: 0, needs_attention: 0 },
  highlight: null,
};

// none/low -> healthy, medium -> monitor, high -> needs_attention — mirrors
// how severityBadgeClasses (src/lib/plantHealth/labels.ts) already renders
// none/low identically (both a soft brand-green badge), so the donut's
// color language matches the /plant-health page's own badges exactly.
const BUCKET_BY_SEVERITY: Record<PlantDiagnosisSeverity, GardenHealthBucket> = {
  none: "healthy",
  low: "healthy",
  medium: "monitor",
  high: "needs_attention",
};

// Real data, not a proxy: each of the user's growing areas contributes its
// MOST RECENT completed plant-health diagnosis (from the weekly
// take-a-photo task's upload, joined via photoJournalEntries.growingAreaId
// — see generateHealthCheckTasks.ts / uploadAndDiagnoseAction). An area
// with no completed diagnosis yet is excluded from every bucket — "no
// assessment" isn't the same as "healthy."
export async function getGardenHealthSummary(tx: Database, userId: string): Promise<GardenHealthSummary> {
  const areas = await tx
    .select({
      id: growingAreas.id,
      type: growingAreas.type,
      sizeValue: growingAreas.sizeValue,
      sizeUnit: growingAreas.sizeUnit,
      widthCm: growingAreas.widthCm,
      lengthCm: growingAreas.lengthCm,
    })
    .from(growingAreas)
    .where(eq(growingAreas.userId, userId));
  if (areas.length === 0) return EMPTY_SUMMARY;
  const areaIds = areas.map((a) => a.id);

  const diagnosisRows = await tx
    .select({
      areaId: photoJournalEntries.growingAreaId,
      severity: plantDiagnoses.severity,
      issue: plantDiagnoses.issue,
      createdAt: plantDiagnoses.createdAt,
    })
    .from(plantDiagnoses)
    .innerJoin(photoJournalEntries, eq(plantDiagnoses.photoJournalEntryId, photoJournalEntries.id))
    .where(
      and(
        eq(plantDiagnoses.userId, userId),
        eq(plantDiagnoses.status, "complete"),
        inArray(photoJournalEntries.growingAreaId, areaIds),
      ),
    )
    .orderBy(desc(plantDiagnoses.createdAt));
  if (diagnosisRows.length === 0) return EMPTY_SUMMARY;

  // Rows are already newest-first, so the first one seen per area is its
  // latest diagnosis.
  const latestByAreaId = new Map<string, (typeof diagnosisRows)[number]>();
  for (const row of diagnosisRows) {
    if (!row.areaId || latestByAreaId.has(row.areaId)) continue;
    latestByAreaId.set(row.areaId, row);
  }

  const counts: Record<GardenHealthBucket, number> = { healthy: 0, monitor: 0, needs_attention: 0 };
  let highlight: GardenHealthHighlight | null = null;

  for (const [areaId, diagnosis] of latestByAreaId) {
    if (!diagnosis.severity) continue;
    const bucket = BUCKET_BY_SEVERITY[diagnosis.severity];
    counts[bucket] += 1;

    if (bucket === "needs_attention" && !highlight && diagnosis.issue) {
      const area = areas.find((a) => a.id === areaId);
      if (area) {
        highlight = { areaId, areaLabel: growingAreaBaseLabel(area), issue: diagnosis.issue };
      }
    }
  }

  return { counts, highlight };
}
