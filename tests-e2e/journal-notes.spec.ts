import { test, expect } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";

test("adding a note shows it in My Notes and on the Timeline", async ({ page }) => {
  await signUpAndOnboard(page);

  await page.goto("/journal");
  await page.getByRole("button", { name: "My Notes", exact: true }).click();
  await page.locator('textarea[name="body"]').fill("First frost expected this week, covering the tender crops.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("First frost expected this week", { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await expect(page.getByText("First frost expected this week", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Note", { exact: true }).first()).toBeVisible();
});

test("a note tagged with a growing area shows that area's label", async ({ page }) => {
  await signUpAndOnboard(page, { addPotEquipment: true });

  await page.goto("/journal");
  await page.getByRole("button", { name: "My Notes", exact: true }).click();
  await page.locator('textarea[name="body"]').fill("Pot looks like it could use a bigger saucer.");
  await page.locator('select[name="growingAreaId"]').selectOption({ index: 1 });
  await page.getByRole("button", { name: "Add note" }).click();

  await expect(page.locator("p", { hasText: "30cm Pot" }).first()).toBeVisible();
});

test("sharing a note makes it appear in Community, and deleting it removes it from both views", async ({ page }) => {
  await signUpAndOnboard(page);

  await page.goto("/journal");
  await page.getByRole("button", { name: "My Notes", exact: true }).click();
  await page.locator('textarea[name="body"]').fill("Tomatoes ripening fast this week, sharing the joy.");
  await page.locator('input[name="visibility"][value="shared_tenant"]').check();
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Tomatoes ripening fast this week", { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "Community", exact: true }).click();
  await expect(page.getByText("Tomatoes ripening fast this week", { exact: false }).first()).toBeVisible();

  await page.getByRole("button", { name: "My Notes", exact: true }).click();
  await page.getByRole("button", { name: /More actions for Tomatoes ripening fast/ }).click();
  await page.getByRole("button", { name: "Delete note" }).click();
  await expect(page.getByText("Tomatoes ripening fast this week", { exact: false })).toHaveCount(0);

  await page.getByRole("button", { name: "Community", exact: true }).click();
  await expect(page.getByText("Tomatoes ripening fast this week", { exact: false })).toHaveCount(0);
});
