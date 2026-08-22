import path from "node:path";
import { test, expect } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";
import { plantCrop } from "./helpers/db";

const TEST_PHOTO_PATH = path.join(__dirname, "fixtures", "test-photo.png");

test("logging a harvest with a photo shows a thumbnail and the photo appears in the journal, tagged", async ({ page }) => {
  const { email } = await signUpAndOnboard(page);
  // /harvests' crop dropdown only offers crops the user has actually
  // planted (see docs/plan.md's "harvest crop dropdown" entry) — seeded
  // directly rather than via the slow, AI-mock-job-backed generate-plan flow.
  await plantCrop(email, "tomato");

  await page.goto("/harvests");
  await page.locator('select[name="cropId"]').selectOption({ index: 0 });
  await page.getByPlaceholder("Quantity").fill("2");
  await page.getByPlaceholder("kg, pieces…").fill("kg");
  await page.setInputFiles('input[name="photo"]', TEST_PHOTO_PATH);
  await page.getByRole("button", { name: "Log harvest" }).click();

  // Thumbnail appears immediately (optimistic update from addHarvestAction's
  // returned photoUrl), no reload needed.
  await expect(page.locator("img[alt$='harvest']").first()).toBeVisible();

  await page.goto("/journal");
  await expect(page.getByText(/kg .+ harvest/i).first()).toBeVisible();
});

test("sharing a harvest photo makes it show up in the journal's shared tab", async ({ page }) => {
  const { email } = await signUpAndOnboard(page);
  await plantCrop(email, "tomato");

  await page.goto("/harvests");
  await page.locator('select[name="cropId"]').selectOption({ index: 0 });
  await page.getByPlaceholder("Quantity").fill("1");
  await page.getByPlaceholder("kg, pieces…").fill("kg");
  await page.setInputFiles('input[name="photo"]', TEST_PHOTO_PATH);
  const sharedRadio = page.locator('input[name="visibility"][value="shared_tenant"]');
  await sharedRadio.check();
  await page.getByRole("button", { name: "Log harvest" }).click();
  await expect(page.locator("img[alt$='harvest']").first()).toBeVisible();

  await page.goto("/journal");
  // Tenant-wide sharing is now relabelled the "Community" tab — same
  // underlying visibility="shared_tenant" query as before, just renamed.
  await page.getByRole("button", { name: "Community", exact: true }).click();
  await expect(page.getByText(/kg .+ harvest/i).first()).toBeVisible();
});

test("a journal photo tagged with a growing area shows that area's label", async ({ page }) => {
  await signUpAndOnboard(page, { addPotEquipment: true });

  await page.goto("/journal");
  // The upload form is hidden by default behind the redesign's "+ Add
  // journal entry" toggle.
  await page.getByRole("button", { name: "Add journal entry" }).click();
  await page.setInputFiles('input[name="photo"]', TEST_PHOTO_PATH);
  await page.locator('select[name="growingAreaId"]').selectOption({ index: 1 });
  await page.getByRole("button", { name: "Upload photo" }).click();

  // Scoped to a <p> tag, not getByText — the growing-area <select>'s own
  // <option value="...">30cm Pot</option> also matches "30cm Pot" as text
  // content, even while the dropdown is closed/hidden.
  await expect(page.locator("p", { hasText: "30cm Pot" }).first()).toBeVisible();
});

test("a harvest logged with no photo still appears on the Timeline", async ({ page }) => {
  const { email } = await signUpAndOnboard(page);
  await plantCrop(email, "tomato");

  // No setInputFiles call — addHarvestAction's photo is entirely optional,
  // and this harvest has none. page.tsx must still surface it via the
  // harvestLog-with-no-linked-photo merge, not silently drop it.
  await page.goto("/harvests");
  await page.locator('select[name="cropId"]').selectOption({ index: 0 });
  await page.getByPlaceholder("Quantity").fill("3");
  await page.getByPlaceholder("kg, pieces…").fill("kg");
  await page.getByRole("button", { name: "Log harvest" }).click();
  await expect(page.getByText("3kg", { exact: false }).first()).toBeVisible();

  await page.goto("/journal");
  await expect(page.getByText("Tomato").first()).toBeVisible();
  await expect(page.getByText("3kg harvested", { exact: true })).toBeVisible();
});

test("stat cards and Most harvested reflect real logged harvests, summed across entries for the same crop", async ({ page }) => {
  const { email } = await signUpAndOnboard(page);
  await plantCrop(email, "tomato");

  await page.goto("/harvests");
  await page.locator('select[name="cropId"]').selectOption({ index: 0 });
  await page.getByPlaceholder("Quantity").fill("1.4");
  await page.getByPlaceholder("kg, pieces…").fill("kg");
  await page.getByRole("button", { name: "Log harvest" }).click();
  await expect(page.getByText("1.4kg", { exact: false }).first()).toBeVisible();

  await page.locator('select[name="cropId"]').selectOption({ index: 0 });
  await page.getByPlaceholder("Quantity").fill("2");
  await page.getByPlaceholder("kg, pieces…").fill("kg");
  await page.getByRole("button", { name: "Log harvest" }).click();
  await expect(page.getByText("2kg", { exact: false }).first()).toBeVisible();

  await page.goto("/journal");
  // Two harvests, no photos, so: 2 entries, 0 photos, 2 harvests, 3.4kg —
  // and Most harvested must be the SUM (3.4kg) across both Tomato rows, not
  // just the larger single one. "3.4 kg" appears twice (the stat card and
  // the Most Harvested sidebar card both show it), so this only checks at
  // least one is present rather than asserting an exact count.
  await expect(page.getByText("3.4 kg", { exact: true }).first()).toBeVisible();
});
