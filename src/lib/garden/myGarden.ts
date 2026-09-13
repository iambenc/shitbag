import { eq, and, inArray, asc } from "drizzle-orm";
import type { Database } from "@/db/client";
import { growingAreas, planRecommendationStages, planRecommendations, crops, cropVarieties, tasks } from "@/db/schema";
import type { GrowingAreaType } from "@/db/schema";
import { growingAreaBaseLabel } from "@/lib/garden/labels";
import { HEIGHT_TYPES } from "@/lib/garden/layout";

export type MyGardenOccupant = { cropEmoji: string; cropName: string };

export type MyGardenAreaCard = {
  id: string;
  type: GrowingAreaType;
  displayLabel: string;
  occupants: MyGardenOccupant[];
  pendingTaskCount: number;
  // Only set for a structure (HEIGHT_TYPES) card — how many containers are
  // currently placed inside it (see parentGrowingAreaId on growingAreas), so
  // the dashboard can read it as its own plot with contents rather than a
  // single item. Undefined for every other card.
  containedCount?: number;
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

  const childrenByParentId = new Map<string, typeof areas>();
  for (const area of areas) {
    if (!area.parentGrowingAreaId) continue;
    const list = childrenByParentId.get(area.parentGrowingAreaId) ?? [];
    list.push(area);
    childrenByParentId.set(area.parentGrowingAreaId, list);
  }

  // Dedupes display labels within a given group only (e.g. two 20cm pots in
  // the SAME group would otherwise both read "20cm Pot") — a numeric suffix
  // only kicks in when a collision actually exists within that group.
  // Deliberately scoped per group rather than across every area: only
  // top-level areas ever get their own card below, so a child sharing a
  // base label with an unrelated top-level area (or a child of a DIFFERENT
  // structure) must never affect either one's numbering — that's not a
  // collision either card/label consumer can ever actually see together.
  function assignLabels(group: typeof areas, out: Map<string, string>) {
    const baseLabels = group.map((area) => growingAreaBaseLabel(area));
    const totals = new Map<string, number>();
    for (const label of baseLabels) totals.set(label, (totals.get(label) ?? 0) + 1);
    const seen = new Map<string, number>();
    group.forEach((area, i) => {
      const baseLabel = baseLabels[i];
      let displayLabel = baseLabel;
      if ((totals.get(baseLabel) ?? 0) > 1) {
        const n = (seen.get(baseLabel) ?? 0) + 1;
        seen.set(baseLabel, n);
        displayLabel = `${baseLabel} ${n}`;
      }
      out.set(area.id, displayLabel);
    });
  }

  // Every area still gets a display label (children included — a task tied
  // to a pot's own stage should still read "your 20cm Pot", not its
  // structure's name), but only a TOP-LEVEL area gets its own card below —
  // a child's occupants/tasks get rolled up into its structure's card
  // instead of appearing twice.
  const displayLabelByAreaId = new Map<string, string>();
  assignLabels(
    areas.filter((a) => !a.parentGrowingAreaId),
    displayLabelByAreaId,
  );
  for (const children of childrenByParentId.values()) assignLabels(children, displayLabelByAreaId);

  const areaLabelByRecommendationId = new Map<string, string>();
  for (const area of areas) {
    const displayLabel = displayLabelByAreaId.get(area.id);
    if (!displayLabel) continue;
    const recIds = recommendationIdsByAreaId.get(area.id) ?? [];
    for (const recId of recIds) areaLabelByRecommendationId.set(recId, displayLabel);
  }

  function pendingTaskCountFor(areaId: string): number {
    const recIds = recommendationIdsByAreaId.get(areaId) ?? [];
    return recIds.reduce((sum, id) => sum + (pendingCountByRecommendationId.get(id) ?? 0), 0);
  }

  const cards = areas
    .filter((area) => !area.parentGrowingAreaId)
    .map((area) => {
      const children = childrenByParentId.get(area.id) ?? [];
      const isStructure = HEIGHT_TYPES.includes(area.type);
      const occupants = [
        ...(occupantsByAreaId.get(area.id) ?? []),
        ...children.flatMap((child) => occupantsByAreaId.get(child.id) ?? []),
      ];
      const pendingTaskCount =
        pendingTaskCountFor(area.id) + children.reduce((sum, child) => sum + pendingTaskCountFor(child.id), 0);
      return {
        id: area.id,
        type: area.type,
        displayLabel: displayLabelByAreaId.get(area.id) ?? growingAreaBaseLabel(area),
        occupants,
        pendingTaskCount,
        containedCount: isStructure ? children.length : undefined,
      };
    });

  return { cards, areaLabelByRecommendationId };
}
