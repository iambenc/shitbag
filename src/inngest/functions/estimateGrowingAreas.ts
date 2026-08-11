import { eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { withTenant } from "@/lib/tenant/withTenant";
import { growingAreaEstimations } from "@/db/schema";
import { getPhotoStorage, ALLOWED_IMAGE_TYPES } from "@/lib/storage";
import { estimateGrowingAreas } from "@/lib/ai/agents/growingAreaEstimator";

type EventData = { estimationId: string; tenantId: string; userId: string };

const EXTENSION_TO_CONTENT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ALLOWED_IMAGE_TYPES).map(([contentType, ext]) => [ext, contentType]),
);

export const estimateGrowingAreasFn = inngest.createFunction(
  { id: "estimate-growing-areas", retries: 2, triggers: [{ event: "growing-area-estimation/requested" }] },
  async ({ event, step }) => {
    const { estimationId, tenantId } = event.data as EventData;

    const context = await step.run("gather-context", async () => {
      return withTenant(tenantId, async (tx) => {
        const [estimation] = await tx
          .select()
          .from(growingAreaEstimations)
          .where(eq(growingAreaEstimations.id, estimationId));
        return { photoStorageKeys: estimation.photoStorageKeys };
      });
    });

    try {
      const result = await step.run("call-agent", async () => {
        const storage = await getPhotoStorage();
        const images = await Promise.all(
          context.photoStorageKeys.map(async (key) => {
            const buffer = await storage.readBuffer(key);
            const extension = key.split(".").pop() ?? "";
            const contentType = EXTENSION_TO_CONTENT_TYPE[extension] ?? "image/jpeg";
            return { buffer, contentType };
          }),
        );
        return estimateGrowingAreas(tenantId, { images });
      });

      await step.run("persist-results", async () => {
        await withTenant(tenantId, async (tx) => {
          await tx
            .update(growingAreaEstimations)
            .set({
              status: "complete",
              provider: result.provider,
              model: result.model,
              rawOutput: result.output,
              completedAt: new Date(),
            })
            .where(eq(growingAreaEstimations.id, estimationId));
        });
      });
    } catch (err) {
      await step.run("mark-failed", async () => {
        await withTenant(tenantId, async (tx) => {
          await tx
            .update(growingAreaEstimations)
            .set({
              status: "failed",
              errorMessage: err instanceof Error ? err.message : "Unknown error",
              completedAt: new Date(),
            })
            .where(eq(growingAreaEstimations.id, estimationId));
        });
      });
    }
  },
);
