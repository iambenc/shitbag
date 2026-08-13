import { test, expect } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";

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
    await page.goto("/garden");

    await page.getByRole("button", { name: "+ Add pots" }).click();
    await page.getByPlaceholder("e.g. 20").fill("25");
    await page.getByLabel("Quantity").fill("2");
    await page.getByRole("button", { name: "Save equipment" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    // The GrowingAreaManager section below reads from a server-fetched prop
    // that Next's revalidatePath-driven refresh doesn't always land inside
    // Playwright's default assertion window on a Turbopack dev server (a
    // reload always picks up the fresh server data, confirmed directly
    // against Postgres — the auto-placement itself is correct and immediate
    // at the DB layer, this is purely a client-refresh-timing gap in dev).
    await page.reload();

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
    await page.goto("/garden");
    await page.getByRole("button", { name: "+ Add pots" }).click();
    await page.getByPlaceholder("e.g. 20").fill("15");
    await page.getByLabel("Quantity").fill("3");
    await page.getByRole("button", { name: "Save equipment" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.reload(); // see the first test's comment on why this is needed
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
    await page.getByRole("button", { name: "Add one Watering Can" }).click();
    await page.getByRole("button", { name: "Save equipment" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("2 placed")).toBeVisible();
  });
});
