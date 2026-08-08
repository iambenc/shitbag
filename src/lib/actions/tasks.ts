"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { withTenant } from "@/lib/tenant/withTenant";
import { tasks } from "@/db/schema";
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
  status: "pending";
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
    task: { id: task.id, title: task.title, notes: task.notes, dueDate: task.dueDate, status: "pending" },
  };
}

export async function toggleTaskCompleteAction(taskId: string, completed: boolean): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx
      .update(tasks)
      .set({ status: completed ? "completed" : "pending", completedAt: completed ? new Date() : null })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  });
}

export async function deleteTaskAction(taskId: string): Promise<void> {
  const { userId, tenantId } = await requireSessionAndTenant();
  await withTenant(tenantId, async (tx) => {
    await tx.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  });
}
