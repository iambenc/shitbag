import { eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { plantDiagnoses, photoJournalEntries, userProfiles } from "@/db/schema";
import { getPhotoStorage, ALLOWED_IMAGE_TYPES } from "@/lib/storage";
import { diagnosePlant } from "@/lib/ai/agents/plantHealth";

type EventData = { diagnosisId: string; tenantId: string; userId: string };

const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_IMAGE_TYPES).map(([contentType, ext]) => [ext, contentType]),
);

export const diagnosePlantFn = inngest.createFunction(
  { id: "diagnose-plant", retries: 2, triggers: [{ event: "plant-diagnosis/requested" }] },
  async ({ event, step }) => {
    const { diagnosisId, tenantId, userId } = event.data as EventData;

    const context = await step.run("gather-context", async () => {
      return withTenant(tenantId, async (tx) => {
        const [diagnosis] = await tx
          .select()
          .from(plantDiagnoses)
          .where(eq(plantDiagnoses.id, diagnosisId));
        const [photo] = await tx
          .select()
          .from(photoJournalEntries)
          .where(eq(photoJournalEntries.id, diagnosis.photoJournalEntryId));
        const [profile] = await tx.select().from(userProfiles).where(eq(userProfiles.userId, userId));

        return {
          storageKey: photo.storageKey,
          expertiseLevel: profile?.expertiseLevel ?? null,
        };
      });
    });

    try {
      const result = await step.run("call-agent", async () => {
        const storage = await getPhotoStorage();
        const imageBuffer = await storage.readBuffer(context.storageKey);
        const extension = context.storageKey.split(".").pop() ?? "";
        const contentType = EXTENSION_TO_CONTENT_TYPE[extension] ?? "image/jpeg";
        return diagnosePlant(tenantId, {
          imageBuffer,
          contentType,
          expertiseLevel: context.expertiseLevel,
        });
      });

      await step.run("persist-results", async () => {
        await withTenant(tenantId, async (tx) => {
          await tx
            .update(plantDiagnoses)
            .set({
              status: "complete",
              provider: result.provider,
              model: result.model,
              issue: result.output.issue,
              severity: result.output.severity,
              confidence: result.output.confidence,
              rawOutput: result.output,
              completedAt: new Date(),
            })
            .where(eq(plantDiagnoses.id, diagnosisId));
        });
      });
    } catch (err) {
      await step.run("mark-failed", async () => {
        await withTenant(tenantId, async (tx) => {
          await tx
            .update(plantDiagnoses)
            .set({
              status: "failed",
              errorMessage: err instanceof Error ? err.message : "Unknown error",
              completedAt: new Date(),
            })
            .where(eq(plantDiagnoses.id, diagnosisId));
        });
      });
    }
  },
);
