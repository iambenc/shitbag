import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { generateGrowPlanFn } from "@/inngest/functions/generateGrowPlan";
import { dailyJobsFn } from "@/inngest/functions/dailyJobs";
import { weeklyShoppingListFn } from "@/inngest/functions/weeklyShoppingList";
import { diagnosePlantFn } from "@/inngest/functions/diagnosePlant";
import { regenerateRecommendationFn } from "@/inngest/functions/regenerateRecommendation";
import { estimateGrowingAreasFn } from "@/inngest/functions/estimateGrowingAreas";
import { applyWeatherAdviceFn } from "@/inngest/functions/applyWeatherAdvice";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    generateGrowPlanFn,
    dailyJobsFn,
    weeklyShoppingListFn,
    diagnosePlantFn,
    regenerateRecommendationFn,
    estimateGrowingAreasFn,
    applyWeatherAdviceFn,
  ],
});
