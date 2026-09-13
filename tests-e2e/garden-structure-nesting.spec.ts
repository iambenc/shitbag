import { test, expect, type Page, type Locator } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";
import { addGrowingAreaAt, upgradeToPaid } from "./helpers/db";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

// Same conventions as garden-layout.spec.ts — see that file's own comments
// on these constants/helpers for the full rationale.
const SUGGESTED_ITEM = 'div[title*="suggested position"]';
const PLACED_ITEM = 'div[title*="drag off the plot to remove"]';

type Box = { x: number; y: number; width: number; height: number };

async function dragTo(page: Page, source: Locator, destination: Locator, targetPoint: (destBox: Box) => { x: number; y: number }) {
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) throw new Error("missing source bounding box");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();

  await destination.scrollIntoViewIfNeeded();
  const destBox = await destination.boundingBox();
  if (!destBox) throw new Error("missing destination bounding box");
  const target = targetPoint(destBox);
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
}

const centerOf = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

test.describe("garden structures as their own sub-plots", () => {
  test("placing a pot inside a greenhouse via drag persists the parent, hides it from the main plot, and removing it frees it again", async ({
    page,
  }) => {
    // Entirely unreachable while layoutPlanning is off (both /garden/layout
    // routes 404 — see src/lib/featureFlags.ts).
    test.skip(!FEATURE_FLAGS.layoutPlanning, "layout planning is feature-flagged off");

    await signUpAndOnboard(page);
    await page.goto("/garden/layout");

    await page.getByLabel("Width (cm)").fill("500");
    await page.getByLabel("Length (cm)").fill("400");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    await page.getByLabel("Type").selectOption("greenhouse");
    await page.getByLabel("Width (cm)").fill("200");
    await page.getByLabel("Length (cm)").fill("300");
    await page.getByLabel("Height (cm)").fill("210");
    await page.getByRole("button", { name: "+ Add growing area" }).click();

    const plot = page.locator(".border-dashed").first();
    await dragTo(page, page.locator(SUGGESTED_ITEM).first(), plot, centerOf);
    await expect(page.locator(PLACED_ITEM).first()).toBeVisible();

    // The main plot's "view inside" affordance is the only entry point into
    // a structure's own sub-plot.
    await page.getByRole("button", { name: /View inside/i }).click();
    await expect(page.getByRole("heading", { name: /Inside your Greenhouse/i })).toBeVisible();
    const structureLayoutUrl = page.url();

    // The sub-page's own AddAreaForm is restricted to container types —
    // greenhouse isn't offered as an option, so nesting a structure inside
    // a structure isn't reachable from the UI at all.
    await expect(page.getByLabel("Type").locator("option", { hasText: "Greenhouse" })).toHaveCount(0);

    await page.getByLabel("Type").selectOption("pot");
    await page.getByPlaceholder("e.g. 25").fill("20");
    await page.getByRole("button", { name: "+ Add growing area" }).click();

    const subPlot = page.locator(".border-dashed").first();
    // handleDragEnd updates the card optimistically before its save action
    // resolves (see LayoutCanvas.tsx) — waiting on the actual POST here,
    // not just the optimistic "looks placed" UI state, is what makes the
    // reload below deterministic rather than a race against an in-flight
    // save (the same trap this session already hit once with a different
    // form, on a different page, this window).
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/garden/layout/") && r.request().method() === "POST"),
      dragTo(page, page.locator(SUGGESTED_ITEM).first(), subPlot, centerOf),
    ]);
    await expect(page.locator(PLACED_ITEM).first()).toBeVisible();

    // Survives a reload — a real persisted position, not just a client-side
    // suggestion — and stays correctly parented to the greenhouse.
    await page.reload();
    await expect(page.locator(PLACED_ITEM).first()).toBeVisible();

    // Back on the main plot, the pot must not appear anywhere (neither
    // suggested nor set aside) — it belongs entirely to the structure now.
    await page.goto("/garden/layout");
    await expect(page.locator(`${SUGGESTED_ITEM}[title*="Pot"], ${PLACED_ITEM}[title*="Pot"]`)).toHaveCount(0);
    await expect(page.getByText("Nothing set aside.")).toBeVisible();

    // "Reset layout" on the MAIN plot must not evict the greenhouse's own
    // contents — only top-level areas are in scope for that button.
    await page.getByRole("button", { name: "Reset layout" }).click();
    await page.goto(structureLayoutUrl);
    await expect(page.locator(PLACED_ITEM).first()).toBeVisible();

    // Dragging the pot off the structure's own sub-plot returns it fully to
    // the global unplaced pool (no parent), not just unplaced-within-here.
    await dragTo(page, page.locator(PLACED_ITEM).first(), page.locator("body"), () => ({ x: 5, y: 5 }));
    await expect(page.getByText("Nothing to place yet")).toBeVisible();
  });

  test("a pot placed inside a structure gets the structure's frost-protection reasoning in a generated grow plan", async ({ page }) => {
    const { email } = await signUpAndOnboard(page);
    const greenhouseId = await addGrowingAreaAt(email, {
      type: "greenhouse",
      widthCm: 200,
      lengthCm: 300,
      heightCm: 210,
      positionXCm: 0,
      positionYCm: 0,
    });
    await addGrowingAreaAt(email, {
      type: "pot",
      sizeValue: 20,
      sizeUnit: "cm",
      positionXCm: 0,
      positionYCm: 0,
      parentGrowingAreaId: greenhouseId,
    });
    await addGrowingAreaAt(email, {
      type: "pot",
      sizeValue: 20,
      sizeUnit: "cm",
      positionXCm: 30,
      positionYCm: 0,
      parentGrowingAreaId: greenhouseId,
    });
    await upgradeToPaid(email);

    await page.goto("/grow-plan");
    await page.getByRole("button", { name: "Generate my grow plan" }).click();
    await expect(page.getByRole("button", { name: "Accept" }).first()).toBeVisible({ timeout: 60_000 });

    // Both seeded pots are inside the greenhouse, so more than one
    // recommendation may legitimately carry the containment note.
    await expect(page.getByText(/extra warmth and frost protection/i).first()).toBeVisible();
  });

  test("a mock grow plan makes a recommendation for every plot, not just Your Plot", async ({ page }) => {
    const { email } = await signUpAndOnboard(page);

    // Your Plot: one pot, unparented.
    await addGrowingAreaAt(email, { type: "pot", sizeValue: 20, sizeUnit: "cm", positionXCm: 0, positionYCm: 0 });

    // A second plot — a polytunnel with its own bare floor space AND a
    // grow bag placed inside it. Both this structure's own row and its
    // child must each get used by a real recommendation for this test to
    // pass — guards against buildMockPlan's single-stage loop silently
    // capping out before every remaining area gets a crop (the exact bug
    // this feature fixed: a plot could go entirely unrecommended purely
    // because it happened to come later in iteration order).
    const polytunnelId = await addGrowingAreaAt(email, {
      type: "polytunnel",
      widthCm: 300,
      lengthCm: 600,
      heightCm: 200,
      positionXCm: 0,
      positionYCm: 0,
    });
    await addGrowingAreaAt(email, {
      type: "grow_bag",
      sizeValue: 40,
      sizeUnit: "litres",
      positionXCm: 0,
      positionYCm: 0,
      parentGrowingAreaId: polytunnelId,
    });

    await upgradeToPaid(email);
    await page.goto("/grow-plan");
    await page.getByRole("button", { name: "Generate my grow plan" }).click();
    await expect(page.getByRole("button", { name: "Accept" }).first()).toBeVisible({ timeout: 60_000 });

    const bodyText = await page.locator("main").innerText();
    expect(bodyText).toContain("Pot");
    expect(bodyText).toContain("Polytunnel");
    expect(bodyText.toLowerCase()).toContain("grow bag");
  });

  test("assigning equipment to a structure from My Garden shows it as its own plot on the dashboard", async ({ page }) => {
    await signUpAndOnboard(page);

    await page.goto("/my-shed");
    await page.getByRole("button", { name: "Garden structures", exact: true }).click();
    await page.getByRole("button", { name: "Edit equipment" }).click();
    await page.getByRole("button", { name: "+ Add greenhouses" }).click();
    const greenhouseFieldset = page.locator("fieldset").filter({ hasText: "Greenhouses" });
    await greenhouseFieldset.getByLabel("Width (cm)").fill("200");
    await greenhouseFieldset.getByLabel("Length (cm)").fill("300");
    await greenhouseFieldset.getByLabel("Height (cm)").fill("210");
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/my-shed") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Save equipment" }).click(),
    ]);
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Planting equipment", exact: true }).click();
    await page.getByRole("button", { name: "Edit equipment" }).click();
    await page.getByRole("button", { name: "+ Add pots" }).click();
    await page.getByPlaceholder("e.g. 20").fill("20");
    await page.getByLabel("Quantity").fill("2");
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/my-shed") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Save equipment" }).click(),
    ]);

    // My Garden's Your Plot section first, then the structure's own
    // section (see GrowingAreaManager.tsx — sections are peers, not grouped
    // under a shared "Your garden structures" heading), then Inventory.
    await page.goto("/garden");
    await expect(page.getByText("Your Plot", { exact: true })).toBeVisible();
    await expect(page.getByText("Inventory", { exact: true })).toBeVisible();
    await expect(page.getByText("Greenhouse", { exact: false }).first()).toBeVisible();

    // Both pots auto-placed into the main garden on save (existing
    // applyEquipmentRows behaviour) — nothing unallocated yet, so a
    // structure's own stepper has no free capacity to claim until some is
    // deliberately freed from the main garden first (see
    // assignEquipmentToStructureAction's own docblock: it only ever claims
    // quantity with no real growingAreas row at all, never silently steals
    // an already-placed one).
    await expect(page.getByText("2 placed")).toBeVisible();
    await expect(page.getByText("0 remaining")).toBeVisible();
    await expect(page.getByRole("button", { name: /Add one Pots to/i })).toBeDisabled();

    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/garden") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Remove one placed Pots" }).click(),
    ]);
    await expect(page.getByText("1 placed")).toBeVisible();
    await expect(page.getByText("1 remaining")).toBeVisible();

    const addToStructure = page.getByRole("button", { name: /Add one Pots to/i });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/garden") && r.request().method() === "POST"),
      addToStructure.click(),
    ]);
    await expect(page.getByText("1 inside")).toBeVisible();
    // Real-time: the same click's optimistic update already moved Inventory
    // back to 0 remaining, no reload needed to see it.
    await expect(page.getByText("0 remaining")).toBeVisible();

    // The dashboard's My Garden grid shows the greenhouse's own card (a
    // "1 item inside" badge) and Your Plot's shortcut tile — individual
    // pots never get their own card there (see MyGardenGrid.tsx); the
    // second, still-unallocated pot is reflected in Your Plot's count
    // instead.
    await page.goto("/dashboard");
    await expect(page.getByText("1 item inside")).toBeVisible();
    await expect(page.getByText("1 item placed")).toBeVisible();
    await expect(page.getByText("20cm Pot", { exact: false })).toHaveCount(0);

    // Every My Garden card is clickable, straight to its matching section
    // on /garden (never /garden/layout, which stays reachable only via that
    // section's own "Arrange inside" link while the flag is on).
    await page.getByText(/Greenhouse/).first().click();
    await expect(page).toHaveURL(/\/garden#structure-/);
    await expect(page.getByText(/Greenhouse/).first()).toBeVisible();

    // Unassigning from My Garden returns it to the unallocated pool, not
    // back into the main garden automatically — Inventory reflects that
    // live too.
    await page.goto("/garden");
    const removeFromStructure = page.getByRole("button", { name: /Remove one Pots from/i });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/garden") && r.request().method() === "POST"),
      removeFromStructure.click(),
    ]);
    await expect(page.getByText("0 inside")).toBeVisible();
    await expect(page.getByText("1 remaining")).toBeVisible();
  });
});
