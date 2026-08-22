import path from "node:path";
import { test, expect } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";
import { upgradeToPaid, getGrowingAreasByType, addHealthCheckTask } from "./helpers/db";

const TEST_PHOTO_PATH = path.join(__dirname, "fixtures", "test-photo.png");

test("dashboard renders all main sections for a freshly onboarded user", async ({ page }) => {
  await signUpAndOnboard(page);
  await expect(page).toHaveURL(/\/dashboard/);

  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByText("garden tasks", { exact: false })).toBeVisible();
  await expect(page.getByText("Coming up", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText("My Garden", { exact: true })).toBeVisible();
  await expect(page.getByText("Garden health", { exact: true })).toBeVisible();
  await expect(page.getByText("7-day weather forecast", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Seed inventory 0 varieties" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Shopping list 0 items" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Manage garden layout" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quick actions" })).toBeVisible();
  await expect(page.getByText(/Tip of the day/)).toBeVisible();

  // Empty states for a brand-new user with no tasks/areas.
  await expect(page.getByText("Nothing due today — nice work.")).toBeVisible();
  await expect(page.getByText("Nothing scheduled yet.")).toBeVisible();
  await expect(page.getByText("added any growing areas yet", { exact: false })).toBeVisible();
  await expect(
    page.getByText("complete a weekly photo health check", { exact: false }),
  ).toBeVisible();

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

  await page.goto("/my-shed");
  await page.getByRole("button", { name: "Planting equipment", exact: true }).click();
  await page.getByRole("button", { name: "Edit equipment" }).click();
  await page.getByRole("button", { name: "+ Add pots" }).click();
  await page.getByPlaceholder("e.g. 20").fill("20");
  await page.getByLabel("Quantity").fill("1");
  await page.getByRole("button", { name: "Save equipment" }).click();
  await page.getByText("Saved.").waitFor();

  await page.goto("/dashboard");
  // Equipment done, seeds still missing — only the seeds prompt remains.
  await expect(page.getByRole("link", { name: "Add equipment →" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add seeds →" })).toBeVisible();

  await page.goto("/my-shed");
  const cropField = page.getByPlaceholder("What did you buy? e.g. Tomato, or something unusual");
  await cropField.fill("Tomato");
  // Closes the autocomplete dropdown — same reasoning as seeds.spec.ts's own
  // addSeed helper: left open, it can visually overlap and intercept the
  // submit-button click below.
  await cropField.press("Escape");
  await page.getByPlaceholder("How many seeds?").fill("10");
  await page.getByRole("button", { name: "Add to inventory" }).click();
  await expect(page.getByText(/Tomato/).first()).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("Finish setting up your garden")).toHaveCount(0);
});

test("an added growing area shows up as a card in the My Garden grid", async ({ page }) => {
  await signUpAndOnboard(page, { addPotEquipment: true });
  await expect(page.getByText("30cm Pot")).toBeVisible();
  await expect(page.getByText("All good")).toBeVisible();
  await expect(page.getByText("Nothing growing here yet.")).toBeVisible();
});

test("floating action button opens quick actions and adds a task for today", async ({ page }) => {
  await signUpAndOnboard(page);

  await page.getByRole("button", { name: "Quick actions" }).click();
  await expect(page.getByRole("link", { name: "Add to My Shed", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan garden layout", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add journal entry", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Diagnose plant", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Add task" }).click();
  await page.getByPlaceholder("e.g. Water the greenhouse").fill("Water the tomatoes");
  await page.getByRole("button", { name: "Add task" }).click();

  await expect(page.getByText("Water the tomatoes")).toBeVisible();
  await expect(page.getByText("You have 1 job today.")).toBeVisible();
});

test("mobile viewport shows the hamburger menu, not the desktop pill nav", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await signUpAndOnboard(page);

  await expect(page.getByRole("link", { name: "Dashboard" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();

  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "Calendar", exact: true })).toBeVisible();
});

test("garden health: a health-check task links to a photo upload, and completing it updates the diagnosis history and the donut", async ({ page }) => {
  // Same reasoning as grow-plan.spec.ts's own test.setTimeout bump — the
  // assertion below already waits up to 60s for the Inngest-processed mock
  // diagnosis, which the 30s outer default would otherwise cap short before
  // it ever got the chance.
  test.setTimeout(90_000);

  const { email } = await signUpAndOnboard(page, { addPotEquipment: true });
  await upgradeToPaid(email);

  const [pot] = await getGrowingAreasByType(email, "pot");
  const taskId = await addHealthCheckTask(email, pot.id, "Take a photo of 30cm Pot for a health check");

  await page.goto("/dashboard");
  await expect(page.getByText("Take a photo of 30cm Pot for a health check")).toBeVisible();
  await expect(page.getByText("Garden health", { exact: true })).toBeVisible();
  await expect(
    page.getByText("complete a weekly photo health check", { exact: false }),
  ).toBeVisible();

  const addPhotoLink = page.getByRole("link", { name: "Add photo →" });
  await expect(addPhotoLink).toBeVisible();
  await expect(addPhotoLink).toHaveAttribute("href", `/plant-health?growingAreaId=${pot.id}&taskId=${taskId}`);
  await addPhotoLink.click();

  await expect(page).toHaveURL(new RegExp(`/plant-health\\?growingAreaId=${pot.id}&taskId=${taskId}`));
  await expect(page.getByText("For: 30cm Pot")).toBeVisible();

  await page.setInputFiles('input[name="photo"]', TEST_PHOTO_PATH);
  await page.getByRole("button", { name: "Upload & diagnose" }).click();

  // uploadAndDiagnoseAction redirects to /plant-health, where a pending
  // diagnosis shows JobInterstitial until the (mock, no API key) AI call
  // resolves — generous timeout for that async round trip.
  await expect(page).toHaveURL("/plant-health");
  await expect(page.getByText("30cm Pot", { exact: true })).toBeVisible({ timeout: 60_000 });

  await page.goto("/dashboard");
  await expect(page.getByText("Take a photo of 30cm Pot for a health check")).toHaveCount(0);
  // Structural assertion, not tied to a specific mock severity index — the
  // donut should now show a real assessed count instead of the empty state.
  await expect(
    page.getByText("complete a weekly photo health check", { exact: false }),
  ).toHaveCount(0);
});
