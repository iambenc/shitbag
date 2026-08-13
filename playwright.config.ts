import { defineConfig, devices } from "@playwright/test";

// Deliberately the SAME port a developer normally runs `next dev` on
// locally, not an isolated one — the local `inngest-cli dev` server (a
// long-running process this repo's workflow starts separately, outside any
// package.json script) is wired to a fixed app URL, confirmed via its
// GraphQL API (`{ apps { url } }` → http://localhost:3002/api/inngest) with
// no live re-discovery of other ports. Grow-plan-generation tests send a
// real Inngest event and need that event to actually reach a running
// function — on a port the dev server doesn't know about, the event is
// accepted but never invokes anything, silently hanging forever. Requires
// the stop-first convention below (this project's Next 16 refuses a second
// `next dev` per directory even on a different port, so there's no
// conflict as long as a developer's own dev server is stopped first).
// A CI environment starts its own `inngest-cli dev` fresh and should point
// it at this same port.
const PORT = 3002;
const baseURL = `http://localhost:${PORT}`;

/**
 * Runs against its own dedicated `next dev` instance — requires stopping any
 * developer-run `next dev` on this same port first (see the port comment
 * above) — with GOOGLE_GENERATIVE_AI_API_KEY explicitly cleared, so
 * src/lib/ai/provider.ts's getModelForTenant falls back to each agent's
 * deterministic mock output instead of resolving a real provider. That's
 * deliberate: a regression pack that hits the real Gemini API on every run
 * would be slow, cost real money, and assert against non-deterministic
 * content. Every agent in this codebase is already required to have a full
 * mock fallback for exactly this kind of testing (see docs/plan.md).
 *
 * Shares the same local Postgres database as normal dev (DATABASE_URL is
 * inherited unchanged) — tests never touch the demo account, they only ever
 * create their own freshly signed-up users (see tests-e2e/helpers/auth.ts),
 * cleaned up afterward by global-teardown.ts.
 */
export default defineConfig({
  testDir: "./tests-e2e",
  // Single worker, always — this targets a `next dev` instance (see
  // webServer below), and dev mode's Turbopack/React-cache request handling
  // isn't safe under real concurrent load the way a production build is:
  // parallel signups genuinely raced and occasionally leaked one request's
  // resolved session/profile into another's response during testing.
  // Confirmed by rerunning a failing test alone (passed) vs. alongside
  // others (failed) — not a bug in the app, a dev-server concurrency limit.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  globalSetup: "./tests-e2e/global-setup.ts",
  globalTeardown: "./tests-e2e/global-teardown.ts",
  // Turbopack dev compiles routes on demand — the first hit to a
  // rarely-exercised route/action combination in a freshly started server
  // can occasionally take longer than the default 5s assertion timeout,
  // independent of anything the test or app is doing wrong. A production
  // build wouldn't have this cost; this is a dev-server-only allowance.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      GOOGLE_GENERATIVE_AI_API_KEY: "",
    } as Record<string, string>,
  },
});
