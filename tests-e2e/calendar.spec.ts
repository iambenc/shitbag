import { test, expect } from "@playwright/test";
import path from "node:path";
import { signUpAndOnboard } from "./helpers/auth";

const authFile = path.join(__dirname, ".auth", "calendar.json");

test.describe("calendar tasks", () => {
  test.beforeAll(async ({ browser }) => {
    // test.use({ storageState: authFile }) below also applies as a default
    // to browser.newContext() calls in this hook (not just the per-test
    // context/page fixtures) — without the explicit override, this would
    // try to read authFile before this hook has ever written it.
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await signUpAndOnboard(page);
    await context.storageState({ path: authFile });
    await context.close();
  });

  test.use({ storageState: authFile });

  test("creating a manual task adds it to today, completing and deleting both work", async ({ page }) => {
    await page.goto("/calendar");

    const title = `Playwright task ${Date.now()}`;
    // The create-task form's hidden dueDate field always tracks whichever
    // calendar day is currently selected, which defaults to today on load.
    await page.getByPlaceholder("Add a task for this day…").fill(title);
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const row = page.locator("li", { hasText: title });
    await expect(row).toBeVisible();

    await row.getByRole("checkbox").check();
    await expect(row.getByRole("checkbox")).toBeChecked();

    await page.getByRole("button", { name: `Delete ${title}` }).click();
    await expect(page.locator("li", { hasText: title })).toHaveCount(0);
  });
});
