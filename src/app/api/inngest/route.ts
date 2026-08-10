import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { generateGrowPlanFn } from "@/inngest/functions/generateGrowPlan";
import { dailyJobsFn } from "@/inngest/functions/dailyJobs";
import { weeklyShoppingListFn } from "@/inngest/functions/weeklyShoppingList";
import { diagnosePlantFn } from "@/inngest/functions/diagnosePlant";
import { regenerateRecommendationFn } from "@/inngest/functions/regenerateRecommendation";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateGrowPlanFn, dailyJobsFn, weeklyShoppingListFn, diagnosePlantFn, regenerateRecommendationFn],
});
