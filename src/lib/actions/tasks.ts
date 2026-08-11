"use server";

import { z } from "zod";
import { eq, and, ne, isNotNull, asc } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import {
  tasks,
  planRecommendationStages,
  growingAreas,
  seedInventory,
  shoppingListItems,
  type TaskSource,
} from "@/db/schema";
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
    const newStatus = completed ? "completed" : "pending";
    // Atomic guarded update, not read-then-write: two concurrent toggles for
    // the same task could otherwise both pass a separate read-then-check and
    // both apply the side effects below (transplant claim, seed deduction)
    // twice. The WHERE clause below doubles as both ownership check and the
    // idempotency guard the old code did with a separate `if` — completing
    // only fires from a not-already-completed status (pending OR missed);
    // un-completing only fires from "completed" specifically, since the seed
    // restoration below must never fire for a task that was never completed
    // (the only real caller, CalendarView.tsx, never uncompletes a "missed"
    // task, but the guard shouldn't rely on that being true forever).
    const [task] = await tx
      .update(tasks)
      .set({ status: newStatus, completedAt: completed ? new Date() : null })
      .where(
        and(
          eq(tasks.id, taskId),
          eq(tasks.userId, userId),
          completed ? ne(tasks.status, "completed") : eq(tasks.status, "completed"),
        ),
      )
      .returning({
        activatesStageId: tasks.activatesStageId,
        cropId: tasks.cropId,
        estimatedSeedsUsed: tasks.estimatedSeedsUsed,
      });
    if (!task) return;

    if (task.cropId && task.estimatedSeedsUsed) {
      // Only rows with a numeric seedCount participate — onboarding's seeds
      // step only ever sets quantityLabel (free text), leaving seedCount
      // null. A crop whose only owned rows are null-seedCount reads as
      // "unknown quantity," not "zero": running the depletion check against
      // an empty numeric-rows set would otherwise wrongly treat "we never
      // tracked a number" the same as "genuinely used it all up."
      const seedRows = await tx
        .select({ id: seedInventory.id, seedCount: seedInventory.seedCount })
        .from(seedInventory)
        .where(
          and(
            eq(seedInventory.userId, userId),
            eq(seedInventory.cropId, task.cropId),
            isNotNull(seedInventory.seedCount),
          ),
        )
        .orderBy(asc(seedInventory.createdAt));

      if (completed && seedRows.length > 0) {
        let remaining = task.estimatedSeedsUsed;
        let totalAfter = 0;
        for (const row of seedRows) {
          const current = row.seedCount ?? 0;
          const deduct = Math.min(current, remaining);
          const newCount = current - deduct;
          remaining -= deduct;
          totalAfter += newCount;
          if (deduct > 0) {
            await tx.update(seedInventory).set({ seedCount: newCount }).where(eq(seedInventory.id, row.id));
          }
        }
        if (totalAfter === 0) {
          // Exact same dedup check generateGrowPlan.ts's shopping-list insert
          // uses — no status/source filter, just a per-crop existence check —
          // reused verbatim rather than re-derived, including its inherited
          // limitation: once ANY shopping-list row exists for this crop
          // (even a since-used-up purchased one), no new prompt fires.
          const [existingItem] = await tx
            .select({ id: shoppingListItems.id })
            .from(shoppingListItems)
            .where(and(eq(shoppingListItems.userId, userId), eq(shoppingListItems.cropId, task.cropId)));
          if (!existingItem) {
            await tx.insert(shoppingListItems).values({
              tenantId,
              userId,
              cropId: task.cropId,
              quantityLabel: "1 packet",
              source: "ai" as const,
            });
          }
        }
      } else if (!completed && seedRows.length > 0) {
        // Un-completing: add the nominal amount back to a single row (the
        // oldest) rather than trying to reverse the exact per-row split the
        // original deduction made — simpler, and the split itself was never
        // meant to be precise across rows, just to consume oldest stock first.
        const oldest = seedRows[0];
        await tx
          .update(seedInventory)
          .set({ seedCount: (oldest.seedCount ?? 0) + task.estimatedSeedsUsed })
          .where(eq(seedInventory.id, oldest.id));
      }
    }

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
