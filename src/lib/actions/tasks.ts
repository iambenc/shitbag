"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { tasks, planRecommendationStages, growingAreas, type TaskSource } from "@/db/schema";
import { requireSessionAndTenant } from "@/lib/actions/shared";

const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  notes: z.string().trim().max(2000).optional(),
});

export type CreatedTask = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string;
  hardDeadlineDate: string | null;
  status: "pending";
  source: TaskSource;
  isIndoor: boolean;
  successionSeriesId: string | null;
};

export type CreateTaskState = { error?: string; task?: CreatedTask };

export async function createTaskAction(
  _prevState: CreateTaskState,
  formData: FormData,
): Promise<CreateTaskState> {
  const parsed = createTaskSchema.safeParse({
    title: formData.get("title"),
    dueDate: formData.get("dueDate"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  }

  const { userId, tenantId } = await requireSessionAndTenant();
  const task = await withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .insert(tasks)
      .values({
        tenantId,
        userId,
        title: parsed.data.title,
        dueDate: parsed.data.dueDate,
        notes: parsed.data.notes ?? null,
      })
      .returning();
    return row;
  });

  return {
    task: {
      id: task.id,
      title: task.title,
      notes: task.notes,
      dueDate: task.dueDate,
      hardDeadlineDate: task.hardDeadlineDate,
      status: "pending",
      source: task.source,
      isIndoor: task.isIndoor,
      successionSeriesId: null,
    },
  };
}

export async function toggleTaskCompleteAction(taskId: string, completed: boolean): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    const [task] = await tx
      .select({ status: tasks.status, activatesStageId: tasks.activatesStageId })
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    if (!task) return;

    const newStatus = completed ? "completed" : "pending";
    // Idempotency guard: a double-click firing two overlapping toggles for
    // the same target status should only apply the transplant side-effect
    // (below) once, not twice.
    if (task.status === newStatus) return;

    await tx
      .update(tasks)
      .set({ status: newStatus, completedAt: completed ? new Date() : null })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    if (!task.activatesStageId) return;

    const [stage] = await tx
      .select({
        id: planRecommendationStages.id,
        planRecommendationId: planRecommendationStages.planRecommendationId,
        stageIndex: planRecommendationStages.stageIndex,
        growingAreaId: planRecommendationStages.growingAreaId,
      })
      .from(planRecommendationStages)
      .where(eq(planRecommendationStages.id, task.activatesStageId));
    if (!stage) return;

    const [precedingStage] = await tx
      .select({ id: planRecommendationStages.id, growingAreaId: planRecommendationStages.growingAreaId })
      .from(planRecommendationStages)
      .where(
        and(
          eq(planRecommendationStages.planRecommendationId, stage.planRecommendationId),
          eq(planRecommendationStages.stageIndex, stage.stageIndex - 1),
        ),
      );

    if (completed) {
      // This task is the transplant INTO `stage` — release whatever
      // preceded it, claim this one.
      if (precedingStage) {
        await tx
          .update(planRecommendationStages)
          .set({ status: "done" })
          .where(eq(planRecommendationStages.id, precedingStage.id));
        if (precedingStage.growingAreaId) {
          await tx
            .update(growingAreas)
            .set({ status: "available" })
            .where(eq(growingAreas.id, precedingStage.growingAreaId));
        }
      }
      await tx.update(planRecommendationStages).set({ status: "active" }).where(eq(planRecommendationStages.id, stage.id));
      if (stage.growingAreaId) {
        await tx.update(growingAreas).set({ status: "in_use" }).where(eq(growingAreas.id, stage.growingAreaId));
      }
    } else {
      // Un-completing: mirror the transition in reverse. Guarded against the
      // area having been deleted or reassigned elsewhere in the interim
      // (only flip status if it's still in the state we expect) rather than
      // blindly overwriting — same tolerance as everywhere else this
      // pipeline handles a since-changed reference.
      await tx.update(planRecommendationStages).set({ status: "upcoming" }).where(eq(planRecommendationStages.id, stage.id));
      if (stage.growingAreaId) {
        await tx
          .update(growingAreas)
          .set({ status: "reserved" })
          .where(and(eq(growingAreas.id, stage.growingAreaId), eq(growingAreas.status, "in_use")));
      }
      if (precedingStage) {
        await tx
          .update(planRecommendationStages)
          .set({ status: "active" })
          .where(eq(planRecommendationStages.id, precedingStage.id));
        if (precedingStage.growingAreaId) {
          await tx
            .update(growingAreas)
            .set({ status: "in_use" })
            .where(and(eq(growingAreas.id, precedingStage.growingAreaId), eq(growingAreas.status, "available")));
        }
      }
    }
  });
}

export async function deleteTaskAction(taskId: string): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  });
}

// Removes every still-pending task in a succession-sowing batch (not just
// one) — status-filtered so already-completed history is untouched, same
// ownership-scoped shape as deleteTaskAction. Returns the removed ids so the
// caller can update local state precisely rather than re-fetching.
export async function cancelSuccessionSeriesAction(successionSeriesId: string): Promise<string[]> {
  const { userId, tenantId } = await requireSessionAndTenant();
  const removed = await withTenant(tenantId, async (tx) => {
    return tx
      .delete(tasks)
      .where(
        and(
          eq(tasks.successionSeriesId, successionSeriesId),
          eq(tasks.userId, userId),
          eq(tasks.status, "pending"),
        ),
      )
      .returning({ id: tasks.id });
  });
  return removed.map((r) => r.id);
}
