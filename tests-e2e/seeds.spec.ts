import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import { signUpAndOnboard } from "./helpers/auth";

// One onboarded user shared by every test in this file (created once in
// beforeAll, reused via storageState) — see helpers/auth.ts's docblock for
// why this stays scoped to this one file and is never shared across spec
// files (parallel workers running different files would otherwise race on
// the same account's data).
const authFile = path.join(__dirname, ".auth", "seeds.json");

test.describe("seed inventory", () => {
  test.beforeAll(async ({ browser }) => {
    // test.use({ storageState: authFile }) below also applies as a default
    // to browser.newContext() calls in this hook — the explicit override
    // stops it from trying to read authFile before it's ever been written.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await signUpAndOnboard(page);
    await context.storageState({ path: authFile });
    await context.close();
  });

  test.use({ storageState: authFile });

  async function addSeed(page: Page, cropName: string, varietyName: string, count: string) {
    const cropField = page.getByPlaceholder("What did you buy? e.g. Tomato, or something unusual");
    await cropField.fill(cropName);
    // Closes the autocomplete dropdown (e.g. "Onion" also matches "Spring
    // Onion") — left open, it can visually overlap and intercept the
    // eventual submit-button click below.
    await cropField.press("Escape");
    const varietyField = page.getByPlaceholder("Variety, e.g. Moneymaker (optional)");
    await varietyField.fill(varietyName);
    await varietyField.press("Escape");
    await page.getByPlaceholder("How many seeds?").fill(count);
    await page.getByRole("button", { name: "Add to inventory" }).click();
  }

  test("adding a seed with a crop already in the catalog shows up in the inventory", async ({ page }) => {
    await page.goto("/seeds");
    await addSeed(page, "Tomato", "", "25");
    await expect(page.getByText(/Tomato/).first()).toBeVisible();
    await expect(page.getByLabel(/Edit quantity: 25 seeds/i)).toBeVisible();
  });

  test("adding a crop that isn't in the catalog yet falls back to the mock AI backfill", async ({ page }) => {
    // GOOGLE_GENERATIVE_AI_API_KEY is cleared for this whole test run (see
    // playwright.config.ts), so this exercises addSeedAction's AI-backfill
    // path against the deterministic mock, not a real Gemini call — an
    // unusual, not-pre-seeded name is needed to force that path.
    await page.goto("/seeds");
    const unusualName = `Playwright Test Fruit ${Date.now()}`;
    await addSeed(page, unusualName, "", "10");
    // Matches both the new list row and the "wasn't in our catalog"
    // confirmation paragraph, which also echoes the crop name — either
    // confirms the row was added, so .first() is enough.
    await expect(page.getByText(unusualName).first()).toBeVisible();
    await expect(page.getByText(/wasn.t in our catalog/i)).toBeVisible();
  });

  test("editing the quantity inline updates the displayed count", async ({ page }) => {
    await page.goto("/seeds");
    await addSeed(page, "Carrot", "", "12");
    const editButton = page.getByLabel(/Edit quantity: 12 seeds/i);
    await expect(editButton).toBeVisible();
    await editButton.click();

    // The list section (with the now-open edit input) renders above the
    // add-seed form (which has its own "How many seeds?" number input) in
    // the DOM — .first() is the edit input, not .last().
    const input = page.locator('input[type="number"]').first();
    await input.fill("40");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByLabel(/Edit quantity: 40 seeds/i)).toBeVisible();
  });

  test("deleting a seed removes it from the list", async ({ page }) => {
    await page.goto("/seeds");
    // A crop already in the catalog (unlike the AI-backfill test above) —
    // no "wasn't in our catalog" confirmation paragraph sticks around
    // afterward to keep echoing the crop name once the row is deleted.
    await addSeed(page, "Onion", "", "5");
    await expect(page.getByRole("button", { name: "Delete Onion" })).toBeVisible();

    await page.getByRole("button", { name: "Delete Onion" }).click();
    await expect(page.getByRole("button", { name: "Delete Onion" })).toHaveCount(0);
  });
});
