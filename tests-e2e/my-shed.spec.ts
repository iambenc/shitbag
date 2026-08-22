import { test, expect } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";

test("My Shed renders stat cards, all four tabs, and the seed inventory on one page", async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto("/my-shed");

  await expect(page.getByRole("heading", { name: "My Shed" })).toBeVisible();
  await expect(page.getByText("Seeds", { exact: true }).first()).toBeVisible();
  for (const tab of ["Seeds", "Planting equipment", "Garden structures", "Tools & equipment"]) {
    await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible();
  }
  await expect(page.getByPlaceholder("What did you buy? e.g. Tomato, or something unusual")).toBeVisible();

  // The full equipment form is hidden by default behind the redesign's
  // read-only tabs — reach it via the Planting equipment tab's own
  // "Edit equipment" toggle, same flow signUpAndOnboard's addPotEquipment
  // option now drives.
  await page.getByRole("button", { name: "Planting equipment", exact: true }).click();
  await page.getByRole("button", { name: "Edit equipment" }).click();
  await expect(page.getByRole("button", { name: "+ Add pots" })).toBeVisible();

  // /seeds retired to a redirect, not removed — old bookmarks/links still work.
  await page.goto("/seeds");
  await expect(page).toHaveURL(/\/my-shed$/);
});
