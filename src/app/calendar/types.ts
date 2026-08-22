import type { TaskStatus, TaskSource } from "@/db/schema";
import type { TaskCategory } from "@/lib/calendar/taskCategory";

export type Task = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string;
  hardDeadlineDate: string | null;
  status: TaskStatus;
  source: TaskSource;
  isIndoor: boolean;
  successionSeriesId: string | null;
  seedBlocked: boolean;
  // True once this task's due date falls after the date a since-lapsed
  // subscription actually ended — see getSubscriptionExpiredAt. The task
  // itself is never deleted, just visually obscured until they resubscribe.
  blurred: boolean;
  category: TaskCategory;
  cropEmoji: string | null;
  cropName: string | null;
  growingAreaId: string | null;
  areaLabel: string | null;
  illustrationSrc: string | null;
};
