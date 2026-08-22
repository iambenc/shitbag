import { test, expect } from "@playwright/test";
import path from "node:path";
import { signUpAndOnboard } from "./helpers/auth";
import { upgradeToPaid, getShoppingListCropSlugs } from "./helpers/db";

const authFile = path.join(__dirname, ".auth", "grow-plan.json");

test.describe("grow plan generation", () => {
  test.beforeAll(async ({ browser }) => {
    // test.use({ storageState: authFile }) below also applies as a default
    // to browser.newContext() calls in this hook — the explicit override
    // stops it from trying to read authFile before it's ever been written.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    const { email } = await signUpAndOnboard(page, { addPotEquipment: true });
    // Generation is gated behind the paid tier (see grow-plan/page.tsx and
    // generateGrowPlanAction) — there's no self-serve upgrade flow to click
    // through in dev (real upgrades go via Stripe), so this mirrors the
    // same direct-SQL simulation this app's own dev-mode checkout already
    // uses.
    await upgradeToPaid(email);
    await context.storageState({ path: authFile });
    await context.close();
  });

  test.use({ storageState: authFile });

  test("generating a plan (mock AI path) produces recommendations that can be accepted or rejected", async ({
    page,
  }) => {
    // Raised from the 30s default — the assertion below already waits up to
    // 60s for the Inngest job (confirmed via its own dev-server API that the
    // job genuinely completes, just sometimes past 30s under load), but the
    // outer per-test timeout was capping it short before it ever got the
    // chance. Same "dev-server-only" latency this file's own webServer
    // config already documents for the default 15s expect timeout.
    test.setTimeout(90_000);

    await page.goto("/grow-plan");
    await page.getByRole("button", { name: "Generate my grow plan" }).click();

    // The Inngest job runs async; JobInterstitial polls the plan's status
    // every 2.5s and refreshes once it's no longer pending. Generous
    // timeout to absorb real job-queue latency, not just network flakiness.
    const acceptButtons = page.getByRole("button", { name: "Accept" });
    await expect(acceptButtons.first()).toBeVisible({ timeout: 60_000 });

    const recommendationCount = await acceptButtons.count();
    expect(recommendationCount).toBeGreaterThan(0);

    await acceptButtons.first().click();
    await expect(page.getByRole("button", { name: "✓ Accepted" }).first()).toBeVisible();

    if (recommendationCount > 1) {
      const rejectButtons = page.getByRole("button", { name: "Reject" });
      await rejectButtons.first().click();
      await expect(page.getByText(/Finding an alternative/i)).toBeVisible();
    }
  });

  test("free-tier users see the membership gate instead of a generate button", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    // Deliberately a separate, still-free account — confirms the paid-tier
    // gate actually blocks, rather than only ever testing the paid path.
    await signUpAndOnboard(page, { addPotEquipment: true });
    await page.goto("/grow-plan");
    // The gate is enforced at the page level, not just as a defensive
    // backstop inside the server action — a free user never sees a
    // "Generate my grow plan" button to click in the first place.
    await expect(page.getByText("This is a membership feature.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate my grow plan" })).toHaveCount(0);
    await page.getByRole("link", { name: "View membership" }).click();
    await expect(page).toHaveURL(/\/upgrade/);
    await context.close();
  });

  test("seeds only reach the shopping list once a recommendation needing them is accepted, not just generated", async ({
    browser,
  }) => {
    // Default 30s test timeout is shorter than the 60s the Accept-button
    // wait below allows for (matching the same generous ceiling the first
    // test in this file already uses) — the Inngest dev job usually
    // finishes in a few seconds, but explicitly widening this stops a slow
    // run from failing on the outer test timeout before that inner one
    // ever gets a chance to.
    test.setTimeout(90_000);
    // Own account (not the shared authFile user above) so its shopping
    // list starts genuinely empty — nothing else in this file has touched
    // it yet.
    const context = await browser.newContext();
    const page = await context.newPage();
    const { email } = await signUpAndOnboard(page, { addPotEquipment: true });
    await upgradeToPaid(email);

    await page.goto("/grow-plan");
    await page.getByRole("button", { name: "Generate my grow plan" }).click();
    const acceptButtons = page.getByRole("button", { name: "Accept" });
    await expect(acceptButtons.first()).toBeVisible({ timeout: 60_000 });

    // A fresh test user owns no seeds at all, so the mock planner marks
    // every recommendation requiresPurchase — generating alone must still
    // leave the shopping list untouched regardless.
    expect(await getShoppingListCropSlugs(email)).toHaveLength(0);

    await acceptButtons.first().click();
    await expect(page.getByRole("button", { name: "✓ Accepted" }).first()).toBeVisible();

    await expect
      .poll(async () => getShoppingListCropSlugs(email))
      .not.toHaveLength(0);

    await context.close();
  });

  test("the harvests page's crop dropdown only offers crops from an accepted recommendation, not the whole catalog", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext();
    const page = await context.newPage();
    const { email } = await signUpAndOnboard(page, { addPotEquipment: true });
    await upgradeToPaid(email);

    // Before any plan exists, there's nothing planted yet — the form is
    // replaced by an explanatory empty state, not a dropdown of every crop
    // in the catalog.
    await page.goto("/harvests");
    await expect(page.getByText(/once a grow plan recommendation has actually been/i)).toBeVisible();
    await expect(page.locator('select[name="cropId"]')).toHaveCount(0);

    await page.goto("/grow-plan");
    await page.getByRole("button", { name: "Generate my grow plan" }).click();
    const acceptButtons = page.getByRole("button", { name: "Accept" });
    await expect(acceptButtons.first()).toBeVisible({ timeout: 60_000 });
    await acceptButtons.first().click();
    await expect(page.getByRole("button", { name: "✓ Accepted" }).first()).toBeVisible();

    await page.goto("/harvests");
    // Not toBeVisible() — <option> elements report as "hidden" while a
    // <select> is closed, same false flag encountered in
    // journal-harvest.spec.ts's growing-area-picker test. The select
    // itself being present and populated is the real signal.
    await expect(page.locator('select[name="cropId"]')).toBeVisible();
    const cropOptions = page.locator('select[name="cropId"] option');
    const optionCount = await cropOptions.count();
    // The seeded crop catalog has dozens of entries — a real reduction to
    // just the accepted recommendation's crop(s) is the actual behavior
    // under test, not merely "some number of options."
    expect(optionCount).toBeGreaterThan(0);
    expect(optionCount).toBeLessThan(10);

    await context.close();
  });
});
