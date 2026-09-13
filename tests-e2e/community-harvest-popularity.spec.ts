import { test, expect } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";
import { upgradeToPaid, addGrowingAreaAt, setShareHarvestData, addHarvestLogRow, favoriteCrop } from "./helpers/db";

// Two pots, not addPotEquipment's default of one — with only one available
// growing area, generateGrowPlan.ts's mock reserves it entirely for its own
// synthetic new-crop demo (see growPlanner.ts's `reservedForDemos`) and
// never actually recommends a real candidate crop at all. A second area is
// what guarantees the favorited crop below is genuinely picked.
async function addTwoPots(email: string): Promise<void> {
  await addGrowingAreaAt(email, { type: "pot", positionXCm: 0, positionYCm: 0, sizeValue: 30, sizeUnit: "cm" });
  await addGrowingAreaAt(email, { type: "pot", positionXCm: 50, positionYCm: 0, sizeValue: 30, sizeUnit: "cm" });
}

test("community harvest popularity surfaces in grow-plan reasoning once 2+ opted-in gardeners have grown the same crop", async ({
  browser,
}) => {
  test.setTimeout(90_000);

  const contextA = await browser.newContext();
  const growerA = await signUpAndOnboard(await contextA.newPage());
  await setShareHarvestData(growerA.email, true);
  await addHarvestLogRow(growerA.email, "tomato", 2, "kg");
  await contextA.close();

  const contextB = await browser.newContext();
  const growerB = await signUpAndOnboard(await contextB.newPage());
  await setShareHarvestData(growerB.email, true);
  await addHarvestLogRow(growerB.email, "tomato", 1.5, "kg");
  await contextB.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  const { email } = await signUpAndOnboard(page);
  await addTwoPots(email);
  await upgradeToPaid(email);
  await favoriteCrop(email, "tomato");

  await page.goto("/grow-plan");
  await page.getByRole("button", { name: "Generate my grow plan" }).click();
  const acceptButtons = page.getByRole("button", { name: "Accept" });
  await expect(acceptButtons.first()).toBeVisible({ timeout: 60_000 });

  await expect(page.getByText(/other gardeners here/i).first()).toBeVisible();
  await context.close();
});

test("a crop with only 1 opted-in grower stays below the anonymity threshold and never surfaces", async ({ browser }) => {
  test.setTimeout(90_000);

  const contextA = await browser.newContext();
  const growerA = await signUpAndOnboard(await contextA.newPage());
  await setShareHarvestData(growerA.email, true);
  await addHarvestLogRow(growerA.email, "carrot", 1, "kg");
  await contextA.close();

  const context = await browser.newContext();
  const page = await context.newPage();
  const { email } = await signUpAndOnboard(page);
  await addTwoPots(email);
  await upgradeToPaid(email);
  await favoriteCrop(email, "carrot");

  await page.goto("/grow-plan");
  await page.getByRole("button", { name: "Generate my grow plan" }).click();
  const acceptButtons = page.getByRole("button", { name: "Accept" });
  await expect(acceptButtons.first()).toBeVisible({ timeout: 60_000 });

  await expect(page.getByText(/other gardeners here/i)).toHaveCount(0);
  await context.close();
});
