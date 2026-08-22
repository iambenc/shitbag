import { eq, and, inArray, asc } from "drizzle-orm";
import type { Database } from "@/db/client";
import { growingAreas, planRecommendationStages, planRecommendations, crops, cropVarieties, tasks } from "@/db/schema";
import type { GrowingAreaType } from "@/db/schema";
import { growingAreaBaseLabel } from "@/lib/garden/labels";

export type MyGardenOccupant = { cropEmoji: string; cropName: string };

export type MyGardenAreaCard = {
  id: string;
  type: GrowingAreaType;
  displayLabel: string;
  occupants: MyGardenOccupant[];
  pendingTaskCount: number;
};

export type MyGardenResult = {
  cards: MyGardenAreaCard[];
  // Recommendation -> the display label of the area it currently occupies —
  // exposed so tasksForDashboard.ts can attach an area label to a task
  // without re-running this same stage/recommendation join itself.
  areaLabelByRecommendationId: Map<string, string>;
};

// Re-keys the same join shape already proven in grow-plan/page.tsx
// (recommendations -> crops/varieties, stages -> growingAreas) by
// growingAreaId instead of by recommendation, for the dashboard's "My
// Garden" grid. Not scoped to a single growPlanId — "what's growing in area
// X right now" is a property of the area's own active stage, not of which
// grow plan happened to generate it.
export async function getMyGardenAreas(tx: Database, userId: string): Promise<MyGardenResult> {
  const areas = await tx
    .select()
    .from(growingAreas)
    .where(eq(growingAreas.userId, userId))
    .orderBy(asc(growingAreas.createdAt));

  if (areas.length === 0) return { cards: [], areaLabelByRecommendationId: new Map() };
  const areaIds = areas.map((a) => a.id);

  const stageRows = await tx
    .select({
      areaId: planRecommendationStages.growingAreaId,
      recommendationId: planRecommendations.id,
      crop: crops,
      variety: cropVarieties,
    })
    .from(planRecommendationStages)
    .innerJoin(planRecommendations, eq(planRecommendationStages.planRecommendationId, planRecommendations.id))
    .innerJoin(crops, eq(planRecommendations.cropId, crops.id))
    .leftJoin(cropVarieties, eq(planRecommendations.varietyId, cropVarieties.id))
    .where(
      and(
        inArray(planRecommendationStages.growingAreaId, areaIds),
        eq(planRecommendationStages.status, "active"),
        inArray(planRecommendations.status, ["pending", "accepted", "regenerating"]),
      ),
    );

  const recommendationIdsByAreaId = new Map<string, string[]>();
  const occupantsByAreaId = new Map<string, MyGardenOccupant[]>();
  for (const row of stageRows) {
    if (!row.areaId) continue;
    const recIds = recommendationIdsByAreaId.get(row.areaId) ?? [];
    recIds.push(row.recommendationId);
    recommendationIdsByAreaId.set(row.areaId, recIds);
    const occupants = occupantsByAreaId.get(row.areaId) ?? [];
    occupants.push({
      cropEmoji: row.crop.emoji,
      cropName: row.variety ? `${row.crop.name} (${row.variety.name})` : row.crop.name,
    });
    occupantsByAreaId.set(row.areaId, occupants);
  }

  const allRecommendationIds = stageRows.map((r) => r.recommendationId);
  const pendingTaskRows = allRecommendationIds.length
    ? await tx
        .select({ planRecommendationId: tasks.planRecommendationId })
        .from(tasks)
        .where(and(inArray(tasks.planRecommendationId, allRecommendationIds), eq(tasks.status, "pending")))
    : [];
  const pendingCountByRecommendationId = new Map<string, number>();
  for (const row of pendingTaskRows) {
    if (!row.planRecommendationId) continue;
    pendingCountByRecommendationId.set(
      row.planRecommendationId,
      (pendingCountByRecommendationId.get(row.planRecommendationId) ?? 0) + 1,
    );
  }

  // Dedupe display labels within this user's own areas only (e.g. two 20cm
  // pots would otherwise both read "20cm Pot") — a numeric suffix only kicks
  // in when a collision actually exists.
  const baseLabels = areas.map((area) => growingAreaBaseLabel(area));
  const labelTotals = new Map<string, number>();
  for (const label of baseLabels) labelTotals.set(label, (labelTotals.get(label) ?? 0) + 1);
  const labelSeen = new Map<string, number>();
  const areaLabelByRecommendationId = new Map<string, string>();

  const cards = areas.map((area, i) => {
    const baseLabel = baseLabels[i];
    let displayLabel = baseLabel;
    if ((labelTotals.get(baseLabel) ?? 0) > 1) {
      const n = (labelSeen.get(baseLabel) ?? 0) + 1;
      labelSeen.set(baseLabel, n);
      displayLabel = `${baseLabel} ${n}`;
    }
    const recIds = recommendationIdsByAreaId.get(area.id) ?? [];
    for (const recId of recIds) areaLabelByRecommendationId.set(recId, displayLabel);
    const pendingTaskCount = recIds.reduce((sum, id) => sum + (pendingCountByRecommendationId.get(id) ?? 0), 0);
    return {
      id: area.id,
      type: area.type,
      displayLabel,
      occupants: occupantsByAreaId.get(area.id) ?? [],
      pendingTaskCount,
    };
  });

  return { cards, areaLabelByRecommendationId };
}
