import { test, expect, type Page, type Locator } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";
import { addGrowingAreaAt } from "./helpers/db";

// Every unplaced, non-dismissed growing area gets an automatic suggested
// spot right on the plot (title contains "suggested position") — nothing is
// saved until the user drags it, which confirms it there (title then ends
// "drag off the plot to remove"). Dragging a confirmed OR suggested area to
// anywhere outside the plot's bounding box sets it aside (title ends "drag
// onto the plot to place", unless it never fit the plot at all). See
// LayoutCanvas.tsx.
const SUGGESTED_ITEM = 'div[title*="suggested position"]';
const PLACED_ITEM = 'div[title*="drag off the plot to remove"]';
const SET_ASIDE_ITEM = 'div[title*="drag onto the plot to place"]';

type Box = { x: number; y: number; width: number; height: number };

/**
 * Drags `source` and drops it wherever `targetPoint` says, relative to
 * `destination`'s own box. Scrolls each element into view independently
 * right before reading its box — this page is taller than the default
 * viewport, so the source (e.g. a card in the "Not on your plot" section)
 * and the destination (the plot, near the top) are often never both
 * visible at once. A mousedown at a coordinate that's scrolled out of the
 * viewport doesn't reliably hit anything, so this always re-anchors scroll
 * position independently for each read rather than assuming one scroll
 * state covers both — the mouse button stays logically "down" across the
 * intermediate scroll, which is how a real drag-and-scroll gesture works
 * too.
 */
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
const belowPlot = (box: Box) => ({ x: box.x + 10, y: box.y + box.height + 80 });

test.describe("plot layout planner", () => {
  test("adding an area suggests a spot for it; dragging confirms and persists; dragging off sets it aside; reset brings back a fresh suggestion", async ({
    page,
  }) => {
    await signUpAndOnboard(page);
    await page.goto("/garden/layout");

    // No plot boundary yet — the manual-entry form, not the canvas.
    await expect(page.getByText("Set your plot size")).toBeVisible();
    await page.getByLabel("Width (cm)").fill("1000");
    await page.getByLabel("Length (cm)").fill("800");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    // Add one growing area from the canvas's own form (not via /garden's
    // equipment picker) — exercises addGrowingAreaFromLayoutAction end to
    // end. It should immediately get an automatic suggested spot on the
    // plot, not require the user to place it manually.
    await page.getByLabel("Size").fill("25");
    await page.getByRole("button", { name: "+ Add growing area" }).click();
    const suggested = page.locator(SUGGESTED_ITEM).first();
    await expect(suggested).toBeVisible();

    const plot = page.locator(".border-dashed").first();

    // Drag it (confirming it, wherever it ends up) — any drop inside the
    // plot both accepts and can adjust the suggestion in one gesture.
    await dragTo(page, suggested, plot, centerOf);

    const placedItem = page.locator(PLACED_ITEM).first();
    await expect(placedItem).toBeVisible();
    await expect(page.locator(SUGGESTED_ITEM)).toHaveCount(0);
    const placedStyle = await placedItem.evaluate((el) => ({ left: el.style.left, top: el.style.top }));

    await page.reload();
    const afterReload = page.locator(PLACED_ITEM).first();
    await expect(afterReload).toBeVisible();
    expect(await afterReload.evaluate((el) => ({ left: el.style.left, top: el.style.top }))).toEqual(placedStyle);

    // Drag it back off the plot, well outside the plot's bounding box —
    // a confirmed area being removed should persist server-side (survives
    // a reload) and, since it's no longer a fresh unconsidered area, land
    // in the "set aside" list rather than immediately being re-suggested.
    await dragTo(page, afterReload, plot, belowPlot);

    await expect(page.locator(SET_ASIDE_ITEM)).toHaveCount(1);
    await expect(page.locator(PLACED_ITEM)).toHaveCount(0);
    await expect(page.locator(SUGGESTED_ITEM)).toHaveCount(0);

    // The underlying position clears server-side (real, persists across a
    // reload) — but "set aside" itself is a client-only preference for this
    // visit, so after a reload the now-unplaced, no-longer-dismissed area
    // is a fresh candidate again and gets suggested a spot once more. This
    // is the intended behaviour, not a bug: dismissing is "not right now,"
    // not "never."
    await page.reload();
    await expect(page.locator(SUGGESTED_ITEM)).toHaveCount(1);
    await expect(page.locator(PLACED_ITEM)).toHaveCount(0);
    await expect(page.locator(SET_ASIDE_ITEM)).toHaveCount(0);

    // Confirm it again, then use the bulk "Reset layout" button — should
    // clear the confirmed position AND go straight back to a fresh
    // suggestion on the plot, not dump it in the set-aside list.
    await dragTo(page, page.locator(SUGGESTED_ITEM).first(), plot, centerOf);
    await expect(page.locator(PLACED_ITEM)).toHaveCount(1);

    // A real in-app modal now, not the browser's window.confirm — the
    // trigger and the modal's confirm action deliberately have different
    // labels ("Reset layout" vs "Yes, reset") so they're never ambiguous
    // to a11y-role-based lookups once the modal is open.
    await page.getByRole("button", { name: "Reset layout" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.getByRole("button", { name: "Yes, reset" }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(page.locator(SUGGESTED_ITEM)).toHaveCount(1);
    await expect(page.locator(PLACED_ITEM)).toHaveCount(0);
    await expect(page.locator(SET_ASIDE_ITEM)).toHaveCount(0);
  });

  test("pots can be dragged to touch with no warning, but beds warn when dragged to touch another bed", async ({
    page,
  }) => {
    await signUpAndOnboard(page);
    await page.goto("/garden/layout");
    await page.getByLabel("Width (cm)").fill("1000");
    await page.getByLabel("Length (cm)").fill("800");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    const plot = page.locator(".border-dashed").first();
    // scale = min(640/1000, 480/800, 3) for this 1000x800 plot — computed
    // once here so the drop points below can target exact cm coordinates.
    const SCALE = 0.6;

    async function placeAt(cmX: number, cmY: number) {
      const suggested = page.locator(SUGGESTED_ITEM).first();
      await expect(suggested).toBeVisible();
      await dragTo(page, suggested, plot, (box) => ({ x: box.x + 2 + cmX * SCALE, y: box.y + 2 + cmY * SCALE }));
    }

    // Two 25cm pots, dropped so their footprints touch exactly (0cm gap
    // between edges: pot1 centred at x=200 spans [187.5,212.5]; pot2
    // centred at x=225 has its left edge at exactly 212.5). Pots require
    // zero clearance, so touching must not warn.
    await page.getByLabel("Size").fill("25");
    await page.getByRole("button", { name: "+ Add growing area" }).click();
    await placeAt(200, 200);
    await page.getByLabel("Size").fill("25");
    await page.getByRole("button", { name: "+ Add growing area" }).click();
    await placeAt(225, 200);

    const pots = page.locator(`${PLACED_ITEM}[title*="Pot"]`);
    await expect(pots).toHaveCount(2);
    await expect(pots.nth(0)).not.toHaveClass(/ring-2/);
    await expect(pots.nth(1)).not.toHaveClass(/ring-2/);

    // Two 100x60cm raised beds, same exact-touching drop pattern (bed1
    // centred at x=600 spans [550,650]; bed2 centred at x=700 has its left
    // edge at exactly 650) — beds require a 45cm walkway, so touching must
    // warn on both.
    await page.getByLabel("Type").selectOption("raised_bed");
    await page.getByLabel("Width (cm)").fill("100");
    await page.getByLabel("Length (cm)").fill("60");
    await page.getByRole("button", { name: "+ Add growing area" }).click();
    await placeAt(600, 200);
    await page.getByLabel("Width (cm)").fill("100");
    await page.getByLabel("Length (cm)").fill("60");
    await page.getByRole("button", { name: "+ Add growing area" }).click();
    await placeAt(700, 200);

    const beds = page.locator(`${PLACED_ITEM}[title*="Raised bed"]`);
    await expect(beds).toHaveCount(2);
    await expect(beds.nth(0)).toHaveClass(/ring-2/);
    await expect(beds.nth(1)).toHaveClass(/ring-2/);
  });

  test("identical set-aside areas group into one card with a count, and dragging the group places just one", async ({
    page,
  }) => {
    await signUpAndOnboard(page);
    await page.goto("/garden/layout");
    await page.getByLabel("Width (cm)").fill("1000");
    await page.getByLabel("Length (cm)").fill("800");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    const plot = page.locator(".border-dashed").first();

    async function setAsideTheSuggestedItem() {
      const suggested = page.locator(SUGGESTED_ITEM).first();
      await expect(suggested).toBeVisible();
      await dragTo(page, suggested, plot, belowPlot);
    }

    // Three identical 25cm pots, each set aside straight from its
    // suggested spot (never confirmed) — should collapse into ONE grouped
    // card with a "3 set aside" title, not three separate cards.
    for (let i = 0; i < 3; i++) {
      await page.getByLabel("Size").fill("25");
      await page.getByRole("button", { name: "+ Add growing area" }).click();
      await setAsideTheSuggestedItem();
    }

    const group = page.locator(SET_ASIDE_ITEM);
    await expect(group).toHaveCount(1);
    await expect(group).toHaveAttribute("title", /3 set aside/);

    // Dragging the grouped card onto the plot places just one instance —
    // the group should shrink to 2, not disappear or place all three.
    await dragTo(page, group, plot, centerOf);

    await expect(page.locator(PLACED_ITEM)).toHaveCount(1);
    await expect(group).toHaveCount(1);
    await expect(group).toHaveAttribute("title", /2 set aside/);
  });

  test("a card placed right at the plot's far edge stays fully inside the canvas, not clipped", async ({ page }) => {
    const { email } = await signUpAndOnboard(page);
    await page.goto("/garden/layout");
    // A large plot relative to the canvas's max render size means the
    // scale shrinks well below 1px/cm — a 15cm pot renders far under the
    // card's 24px legibility floor, which is exactly the mismatch that let
    // an edge-placed card's floor-inflated box extend past the container.
    await page.getByLabel("Width (cm)").fill("3000");
    await page.getByLabel("Length (cm)").fill("2000");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    // Placed directly via SQL at the exact far corner a hard clamp would
    // allow (positionXCm + widthCm === plotWidthCm) — no UI path reliably
    // reaches this exact spot, and the bug only shows up right at the edge.
    await addGrowingAreaAt(email, { type: "pot", sizeValue: 15, sizeUnit: "cm", positionXCm: 2985, positionYCm: 1985 });
    await page.reload();

    const item = page.locator(PLACED_ITEM).first();
    await expect(item).toBeVisible();
    const container = page.locator(".border-dashed").first();

    const itemBox = await item.boundingBox();
    const containerBox = await container.boundingBox();
    if (!itemBox || !containerBox) throw new Error("missing bounding box");

    expect(itemBox.x + itemBox.width).toBeLessThanOrEqual(containerBox.x + containerBox.width + 0.5);
    expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(containerBox.y + containerBox.height + 0.5);
    expect(itemBox.x).toBeGreaterThanOrEqual(containerBox.x - 0.5);
    expect(itemBox.y).toBeGreaterThanOrEqual(containerBox.y - 0.5);
  });

  test("suggestions prioritize beds/raised beds/planters over pots, even when a pot has the bigger footprint", async ({
    page,
  }) => {
    await signUpAndOnboard(page);
    await page.goto("/garden/layout");
    // Sized so a 40cm pot (1600cm² footprint) and a 40x30cm raised bed
    // (1200cm² footprint, but needing 45cm of walkway on every side) can't
    // both be suggested a spot at once: the bed only ever fits at exactly
    // (45,45), and a pot placed anywhere first blocks that one spot with
    // no room for the bed to land elsewhere. Priority-by-type, not by
    // footprint, decides who gets placed and who's left set aside.
    await page.getByLabel("Width (cm)").fill("130");
    await page.getByLabel("Length (cm)").fill("120");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    // Add the bigger-footprint pot first — under a footprint-only sort
    // it would win the shared spot purely by being added/sorted first;
    // priority-by-type should still put the bed there instead regardless
    // of add order.
    await page.getByLabel("Size").fill("40");
    await page.getByRole("button", { name: "+ Add growing area" }).click();
    await page.getByLabel("Type").selectOption("raised_bed");
    await page.getByLabel("Width (cm)").fill("40");
    await page.getByLabel("Length (cm)").fill("30");
    await page.getByRole("button", { name: "+ Add growing area" }).click();

    // No dragging at all — this is purely about what the automatic
    // suggestion proposes. A doesn't-fit card's title ends "doesn't fit
    // your plot at its current size" instead of the usual set-aside
    // "drag onto the plot to place" — the two are mutually exclusive, so
    // this doesn't match SET_ASIDE_ITEM.
    const suggestedBed = page.locator(`${SUGGESTED_ITEM}[title*="Raised bed"]`);
    await expect(suggestedBed).toHaveCount(1);
    const setAsidePot = page.locator('div[title*="Pot"][title*="doesn\'t fit"]');
    await expect(setAsidePot).toHaveCount(1);
  });
});
