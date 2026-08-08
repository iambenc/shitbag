import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { inngest } from "@/inngest/client";

/**
 * Temporary dev/test hook: fires the same event dailyJobsFn/weeklyShoppingListFn
 * already listen for alongside their real cron triggers, so tests don't have
 * to wait for the actual schedule. Gated behind a valid session (not a public
 * endpoint) but otherwise runs across every tenant's data — fine for this
 * stage, not something to ship without real admin tooling (Phase 8) around
 * it, or just removing it once cron execution can be verified in a real
 * deployment instead.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}) as { job?: unknown; weatherScenario?: unknown });
  const job = body?.job;
  if (job !== "daily" && job !== "weekly") {
    return NextResponse.json({ error: "job must be 'daily' or 'weekly'" }, { status: 400 });
  }
  const weatherScenario = body?.weatherScenario;
  const validScenario =
    weatherScenario === "hot_dry" || weatherScenario === "rainy" || weatherScenario === "mild"
      ? weatherScenario
      : undefined;

  await inngest.send({ name: "dev/run-jobs", data: { job, weatherScenario: validScenario } });
  return NextResponse.json({ triggered: job, weatherScenario: validScenario });
}
