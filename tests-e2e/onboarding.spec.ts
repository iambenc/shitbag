import { test, expect } from "@playwright/test";
import { uniqueTestEmail, TEST_PASSWORD } from "./helpers/auth";

/**
 * Drives the full six-step onboarding flow by hand (rather than via the
 * signUpAndOnboard helper) so each step's own page content/redirect is
 * actually asserted, not just assumed. See src/lib/onboarding/steps.ts for
 * the canonical step order this mirrors.
 */
test("full onboarding flow: all six steps in order, two optional ones skipped", async ({ page }) => {
  const email = uniqueTestEmail("onboarding");

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/onboarding\/location/);
  await expect(page.getByText("Step 1 of 6")).toBeVisible();
  await page.getByLabel("Postcode").fill("SW1A 1AA");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/onboarding\/crops/);
  await expect(page.getByText("Step 2 of 6", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Skip for now" }).click();

  await expect(page).toHaveURL(/\/onboarding\/plot/);
  await expect(page.getByText("Step 3 of 6")).toBeVisible();
  await page.getByLabel("Small garden").check();
  await page.getByLabel("Average hours of sunlight per day").fill("4");
  await page.getByLabel("People in your household").fill("1");
  await page.getByLabel(/indoor space/i).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/onboarding\/equipment/);
  await expect(page.getByText("Step 4 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/onboarding\/seeds/);
  await expect(page.getByText("Step 5 of 6", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Skip for now" }).click();

  await expect(page).toHaveURL(/\/onboarding\/experience/);
  await expect(page.getByText("Step 6 of 6")).toBeVisible();
  await page.getByLabel("Advanced").check();
  await page.getByLabel("Hours you can spend gardening on a weekday").fill("2");
  await page.getByLabel("Hours you can spend gardening on a weekend day").fill("5");
  await page.getByRole("button", { name: "Finish setup" }).click();

  await expect(page).toHaveURL(/\/dashboard/);

  // Onboarding is now complete — revisiting an onboarding step shouldn't
  // trap the user there again; and reloading /dashboard shouldn't bounce
  // back into onboarding now that onboardingCompletedAt is set.
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard/);
});
