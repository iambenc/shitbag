import path from "node:path";
import { test, expect } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";
import { addWeatherTask, plantCrop } from "./helpers/db";

const authFile = path.join(__dirname, ".auth", "calendar.json");
const TEST_PHOTO_PATH = path.join(__dirname, "fixtures", "test-photo.png");

test.describe("calendar tasks", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await signUpAndOnboard(page);
    await context.storageState({ path: authFile });
    await context.close();
  });

  test.use({ storageState: authFile });

  test("creating a manual task adds it to today, marking complete and deleting both work", async ({ page }) => {
    await page.goto("/calendar");

    const title = `Playwright task ${Date.now()}`;
    await page.getByPlaceholder("Add a task for this day…").fill(title);
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const row = page.locator("li", { hasText: title });
    await expect(row).toBeVisible();
    // Falls back to the "other" category badge — a plain manual task with no
    // matching structural signal or title keyword (see taskCategory.ts).
    await expect(row.getByText("Task", { exact: true })).toBeVisible();

    await row.getByRole("button", { name: "Mark complete" }).click();
    await expect(row.getByRole("button", { name: "Completed" })).toBeVisible();

    // Delete now lives behind the "···" overflow menu, consolidated with
    // "Cancel remaining" — a deliberate interaction change from the old
    // always-visible Delete button.
    await row.getByRole("button", { name: `More actions for ${title}` }).click();
    await row.getByRole("button", { name: `Delete ${title}` }).click();
    await expect(page.locator("li", { hasText: title })).toHaveCount(0);
  });

  test("the Month/List View toggle shows the same task in both views", async ({ page }) => {
    await page.goto("/calendar");

    const title = `Agenda toggle task ${Date.now()}`;
    await page.getByPlaceholder("Add a task for this day…").fill(title);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator("li", { hasText: title })).toBeVisible();

    await page.getByRole("button", { name: "List View", exact: true }).click();
    await expect(page.locator("li", { hasText: title })).toBeVisible();

    await page.getByRole("button", { name: "Month", exact: true }).click();
    await expect(page.locator("li", { hasText: title })).toBeVisible();
  });

  test("a weather-sourced task's real notes surface as today's weather-impact callout", async ({ page }) => {
    const { email } = await signUpAndOnboard(page);
    await addWeatherTask(email, "Extra watering today", "It's been hot and dry — your plants will need more water than usual.");

    await page.goto("/calendar");
    // The title/notes appear twice — once as the weather-impact callout
    // headline, once on the task's own card — so scope to at least one
    // visible match rather than asserting a single exact node.
    await expect(page.getByText("Extra watering today", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/hot and dry/).first()).toBeVisible();
    // The seeded task itself also renders as a normal card, with a
    // "Watering" category badge (source: "weather" always maps to watering
    // — see taskCategory.ts).
    await expect(page.locator("li", { hasText: "Extra watering today" }).getByText("Watering", { exact: true })).toBeVisible();
  });

  test("a logged harvest shows a carrot marker on today's calendar cell", async ({ page }) => {
    const { email } = await signUpAndOnboard(page);
    await plantCrop(email, "tomato");

    await page.goto("/harvests");
    await page.locator('select[name="cropId"]').selectOption({ index: 0 });
    await page.getByPlaceholder("Quantity").fill("2");
    await page.getByPlaceholder("kg, pieces…").fill("kg");
    await page.setInputFiles('input[name="photo"]', TEST_PHOTO_PATH);
    await page.getByRole("button", { name: "Log harvest" }).click();
    await expect(page.locator("img[alt$='harvest']").first()).toBeVisible();

    await page.goto("/calendar");
    // No real "you should harvest this" task type exists anywhere in this
    // app (grow-plan tasks are sow/feed/transplant only) — the carrot marker
    // is driven by genuine harvestLog history instead, see page.tsx.
    await expect(page.getByRole("img", { name: "Harvest" }).first()).toBeVisible();
  });
});
