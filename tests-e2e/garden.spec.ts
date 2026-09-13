import { test, expect } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";
import { upgradeToPaid } from "./helpers/db";

// Each test gets its own fresh signup (not a shared beforeAll user, unlike
// most other spec files in this pack) — both tests below assert on
// aggregate "You own N" / "N placed" counts for the *same* equipment type
// (pots), so sharing one account across tests would make a later test's
// count include an earlier test's leftover rows, and — worse — leave two
// simultaneously-rendered "Quantity" fields on the page (one per pre-
// existing row) once a second row is added, which getByLabel("Quantity")
// can't disambiguate. A fresh account per test sidesteps all of that.
test.describe("garden equipment", () => {
  test("adding a pot automatically places it as growing space", async ({ page }) => {
    await signUpAndOnboard(page);
    // Equipment is added on /my-shed; GrowingAreaManager's owned/placed
    // counts are shown on /garden — a genuine cross-page navigation (not a
    // same-page reload) after saving always fetches fresh server data
    // regardless of revalidatePath timing, since updateEquipmentAction
    // revalidates both paths (see docs/plan.md's "My Shed" entry).
    await page.goto("/my-shed");

    await page.getByRole("button", { name: "Planting equipment", exact: true }).click();
    await page.getByRole("button", { name: "Edit equipment" }).click();
    await page.getByRole("button", { name: "+ Add pots" }).click();
    await page.getByPlaceholder("e.g. 20").fill("25");
    await page.getByLabel("Quantity").fill("2");
    await page.getByRole("button", { name: "Save equipment" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.goto("/garden");

    // Confirms the equipment/growingAreaSync auto-placement feature: newly
    // added growing-space equipment becomes ready-to-grow-in space without
    // any manual "+" click on the placed-count stepper below.
    await expect(page.getByText("You own 2")).toBeVisible();
    await expect(page.getByText("2 placed")).toBeVisible();
  });

  test("manually reducing placed count is a deliberate override that a later unrelated save doesn't undo", async ({
    page,
  }) => {
    await signUpAndOnboard(page);
    await page.goto("/my-shed");
    await page.getByRole("button", { name: "Planting equipment", exact: true }).click();
    await page.getByRole("button", { name: "Edit equipment" }).click();
    await page.getByRole("button", { name: "+ Add pots" }).click();
    await page.getByPlaceholder("e.g. 20").fill("15");
    await page.getByLabel("Quantity").fill("3");
    await page.getByRole("button", { name: "Save equipment" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.goto("/garden");
    await expect(page.getByText("You own 3")).toBeVisible();
    await expect(page.getByText("3 placed")).toBeVisible();

    await page.getByRole("button", { name: "Remove one placed Pots" }).click();
    await expect(page.getByText("2 placed")).toBeVisible();

    // An unrelated equipment save (adding a tool, not touching pots at all)
    // must not silently re-place the pot the user deliberately held back —
    // see applyEquipmentRows's pre-save-quantity diff in docs/plan.md. The
    // stepper's visible glyph is "+" but its accessible name (what the
    // increment buttons are actually keyed by, since they carry an
    // aria-label) is "Add one <Equipment Name>".
    await page.goto("/my-shed");
    await page.getByRole("button", { name: "Tools & equipment", exact: true }).click();
    await page.getByRole("button", { name: "Edit equipment" }).click();
    await page.getByRole("button", { name: "Add one Watering Can" }).click();
    await page.getByRole("button", { name: "Save equipment" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    await page.goto("/garden");
    await expect(page.getByText("2 placed")).toBeVisible();
  });

  test("trying to remove a pot that's actively growing something shows a clear warning instead of silently reverting", async ({
    page,
  }) => {
    const { email } = await signUpAndOnboard(page);
    await page.goto("/my-shed");
    await page.getByRole("button", { name: "Planting equipment", exact: true }).click();
    await page.getByRole("button", { name: "Edit equipment" }).click();
    await page.getByRole("button", { name: "+ Add pots" }).click();
    await page.getByPlaceholder("e.g. 20").fill("20");
    await page.getByLabel("Quantity").fill("1");
    await page.getByRole("button", { name: "Save equipment" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    // Generate and accept a mock grow plan — with only one pot owned, the
    // mock planner claims it (status: in_use), which is exactly what makes
    // syncGrowingAreasAction unable to free it via the placed-count stepper
    // (it only ever removes `status: "available"` rows — see that action's
    // own docblock).
    await upgradeToPaid(email);
    await page.goto("/grow-plan");
    await page.getByRole("button", { name: "Generate my grow plan" }).click();
    await expect(page.getByRole("button", { name: "Accept" }).first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Accept" }).first().click();

    await page.goto("/garden");
    await expect(page.getByText("1 placed")).toBeVisible();

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/garden") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Remove one placed Pots" }).click(),
    ]);

    // The count reverts to what it actually is server-side (still 1, not
    // silently stuck at some other number) AND a clear reason is shown —
    // the bug this test guards against was the count just snapping back
    // with zero explanation, indistinguishable from the click not having
    // registered at all.
    await expect(page.getByText("1 placed")).toBeVisible();
    await expect(page.getByText("can't be removed right now", { exact: false })).toBeVisible();
  });
});
