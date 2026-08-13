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

  // Garden equipment/seed inventory are no longer onboarding steps (see
  // src/lib/onboarding/steps.ts) — a freshly onboarded user has neither yet,
  // so SetupBanner should be showing both prompts.
  await expect(page.getByText("Finish setting up your garden")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add equipment →" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add seeds →" })).toBeVisible();
});

test("SetupBanner disappears once equipment and seeds are both added, and not before", async ({ page }) => {
  await signUpAndOnboard(page);
  await expect(page.getByRole("link", { name: "Add equipment →" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add seeds →" })).toBeVisible();

  await page.goto("/garden");
  await page.getByRole("button", { name: "+ Add pots" }).click();
  await page.getByPlaceholder("e.g. 20").fill("20");
  await page.getByLabel("Quantity").fill("1");
  await page.getByRole("button", { name: "Save equipment" }).click();
  await page.getByText("Saved.").waitFor();

  await page.goto("/dashboard");
  // Equipment done, seeds still missing — only the seeds prompt remains.
  await expect(page.getByRole("link", { name: "Add equipment →" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add seeds →" })).toBeVisible();

  await page.goto("/seeds");
  await page.getByPlaceholder("What did you buy? e.g. Tomato, or something unusual").fill("Tomato");
  await page.getByPlaceholder("How many seeds?").fill("10");
  await page.getByRole("button", { name: "Add to inventory" }).click();
  await expect(page.getByText(/Tomato/).first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("Finish setting up your garden")).toHaveCount(0);
});
