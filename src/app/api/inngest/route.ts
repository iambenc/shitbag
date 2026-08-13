import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { generateGrowPlanFn } from "@/inngest/functions/generateGrowPlan";
import { dailyJobsFn } from "@/inngest/functions/dailyJobs";
import { weeklyShoppingListFn } from "@/inngest/functions/weeklyShoppingList";
import { diagnosePlantFn } from "@/inngest/functions/diagnosePlant";
import { regenerateRecommendationFn } from "@/inngest/functions/regenerateRecommendation";
import { estimateGrowingAreasFn } from "@/inngest/functions/estimateGrowingAreas";
import { applyWeatherAdviceFn } from "@/inngest/functions/applyWeatherAdvice";
import { generateMaintenanceTasksFn } from "@/inngest/functions/generateMaintenanceTasks";

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
    generateMaintenanceTasksFn,
  ],
});
