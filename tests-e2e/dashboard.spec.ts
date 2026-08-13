import { test, expect } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";

test("dashboard renders all main sections for a freshly onboarded user", async ({ page }) => {
  const { email } = await signUpAndOnboard(page);
  await expect(page).toHaveURL(/\/dashboard/);

  await expect(page.getByText(`Welcome, ${email}`)).toBeVisible();
  await expect(page.getByText("Weather this week")).toBeVisible();
  await expect(page.getByText("Calendar", { exact: true })).toBeVisible();
  // Appears twice — the dashboard card heading and the resource-links
  // section's own "Shopping list" link — either confirms the section rendered.
  await expect(page.getByText("Shopping list", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Seed inventory" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Manage your garden layout/ })).toBeVisible();

  // A free-tier user should see the upgrade prompt banner.
  await expect(page.getByText(/Unlock AI-generated grow plans/)).toBeVisible();
});
