import { test, expect, type Page, type Locator } from "@playwright/test";
import { signUpAndOnboard } from "./helpers/auth";
import { addGrowingAreaAt, addCompletedEstimation, getGrowingAreasByType } from "./helpers/db";

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

  test("pots touching with no gap show no warning, but beds touching with no gap warn", async ({ page }) => {
    const { email } = await signUpAndOnboard(page);
    await page.goto("/garden/layout");
    await page.getByLabel("Width (cm)").fill("1000");
    await page.getByLabel("Length (cm)").fill("800");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    // Seeded directly via SQL rather than dragged into place: dragging now
    // snaps to the 15cm grid (see GRID_CM in layout.ts), and neither 25cm
    // (a pot) nor 100cm (a raised bed's width) divides evenly into that
    // grid, so two independently-snapped drags can't reliably land exactly
    // edge-to-edge with a 0cm gap — this test is about the overlap-warning
    // rendering logic itself (isTooClose/pairClearanceCm), not about
    // reproducing an exact touch via a drag gesture.
    //
    // Two 25cm pots, touching exactly (pot1 spans x:[200,225), pot2's left
    // edge starts exactly where pot1's ends). Pots require zero clearance,
    // so touching must not warn.
    await addGrowingAreaAt(email, { type: "pot", sizeValue: 25, sizeUnit: "cm", positionXCm: 200, positionYCm: 200 });
    await addGrowingAreaAt(email, { type: "pot", sizeValue: 25, sizeUnit: "cm", positionXCm: 225, positionYCm: 200 });

    // Two 100x60cm raised beds, same exact-touching placement (bed1 spans
    // x:[600,700), bed2's left edge starts exactly where bed1's ends) —
    // beds require a 45cm walkway, so touching must warn on both.
    await addGrowingAreaAt(email, {
      type: "raised_bed",
      widthCm: 100,
      lengthCm: 60,
      positionXCm: 600,
      positionYCm: 200,
    });
    await addGrowingAreaAt(email, {
      type: "raised_bed",
      widthCm: 100,
      lengthCm: 60,
      positionXCm: 700,
      positionYCm: 200,
    });
    await page.reload();

    const pots = page.locator(`${PLACED_ITEM}[title*="Pot"]`);
    await expect(pots).toHaveCount(2);
    await expect(pots.nth(0)).not.toHaveClass(/ring-2/);
    await expect(pots.nth(1)).not.toHaveClass(/ring-2/);

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

  test("differently-sized pots render as separate same-sized cards in the tray, each labelled with its own size", async ({
    page,
  }) => {
    await signUpAndOnboard(page);
    await page.goto("/garden/layout");
    await page.getByLabel("Width (cm)").fill("1000");
    await page.getByLabel("Length (cm)").fill("800");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    const plot = page.locator(".border-dashed").first();

    async function addAndSetAside(sizeValue: string) {
      await page.getByLabel("Size").fill(sizeValue);
      await page.getByRole("button", { name: "+ Add growing area" }).click();
      const suggested = page.locator(SUGGESTED_ITEM).first();
      await expect(suggested).toBeVisible();
      await dragTo(page, suggested, plot, belowPlot);
    }

    // A 15cm and a 45cm pot — different sizes, so they don't share a
    // stackKey and land as two separate tray cards, not grouped. Every tray
    // card renders at the same fixed TRAY_CARD_PX box regardless of the
    // area's real footprint (a deliberate uniform-grid design, not scaled
    // by size) — what actually differs card-to-card is the visible size
    // label, not the box itself.
    await addAndSetAside("15");
    await addAndSetAside("45");

    const smallCard = page.locator(`${SET_ASIDE_ITEM}[title*="15cm"]`);
    const largeCard = page.locator(`${SET_ASIDE_ITEM}[title*="45cm"]`);
    await expect(smallCard).toHaveCount(1);
    await expect(largeCard).toHaveCount(1);

    const smallBox = await smallCard.boundingBox();
    const largeBox = await largeCard.boundingBox();
    if (!smallBox || !largeBox) throw new Error("missing box");

    expect(smallBox.width).toBeCloseTo(largeBox.width, 0);
    expect(smallBox.height).toBeCloseTo(largeBox.height, 0);

    // The card's own visible text shows the actual size, not just the
    // generic "Pot" type label.
    await expect(smallCard.getByText("15cm")).toBeVisible();
    await expect(largeCard.getByText("45cm")).toBeVisible();
  });

  test("owning several identical pots waits them together in the tray instead of suggesting all of them on the plot at once", async ({
    page,
  }) => {
    await signUpAndOnboard(page);
    await page.goto("/garden/layout");
    await page.getByLabel("Width (cm)").fill("1000");
    await page.getByLabel("Length (cm)").fill("800");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    const plot = page.locator(".border-dashed").first();

    // Three identical 25cm pots added back to back (unlike the grouping
    // test above, none dismissed in between) — a genuinely one-of-a-kind
    // area still gets auto-suggested a spot, but 2+ interchangeable
    // instances of the same equipment shouldn't all land on the plot as
    // separate suggestions simultaneously; they wait together as one
    // grouped tray card until dragged out individually. Each iteration
    // waits for the button to re-enable first — AddAreaForm's fields aren't
    // disabled while a previous add is still in flight, so submitting
    // before that completes isn't a realistic "add three pots" gesture.
    const addButton = page.getByRole("button", { name: "+ Add growing area" });
    for (let i = 0; i < 3; i++) {
      await expect(addButton).toBeEnabled();
      await page.getByLabel("Size").fill("25");
      await addButton.click();
    }
    await expect(page.locator(SUGGESTED_ITEM)).toHaveCount(0);
    const group = page.locator(SET_ASIDE_ITEM);
    await expect(group).toHaveCount(1);
    await expect(group).toHaveAttribute("title", /3 set aside/);

    // Drag one out — the stack shrinks to 2, which is still a stack, so it
    // still shouldn't auto-suggest.
    await dragTo(page, group, plot, centerOf);
    await expect(page.locator(PLACED_ITEM)).toHaveCount(1);
    await expect(page.locator(SUGGESTED_ITEM)).toHaveCount(0);
    await expect(group).toHaveCount(1);
    await expect(group).toHaveAttribute("title", /2 set aside/);

    // Drag another out — exactly one pot remains unplaced, which is now
    // genuinely one-of-a-kind among unplaced areas, so it starts getting
    // auto-suggested like any other unique area.
    await dragTo(page, group, plot, centerOf);
    await expect(page.locator(PLACED_ITEM)).toHaveCount(2);
    await expect(page.locator(SET_ASIDE_ITEM)).toHaveCount(0);
    await expect(page.locator(SUGGESTED_ITEM)).toHaveCount(1);
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

  test("confirming a photo estimate locks in a raised bed's estimated position, but only suggests a spot for a pot", async ({
    page,
  }) => {
    const { email } = await signUpAndOnboard(page);

    // Bypasses the real photo-upload + Inngest-job pipeline (already
    // exercised elsewhere) — this is purely about what
    // confirmGrowingAreaProposalsAction does with position data once an
    // estimate is "complete", not about producing one.
    const estimationId = await addCompletedEstimation(email, {
      areas: [
        {
          type: "raised_bed",
          sizeValue: null,
          sizeUnit: null,
          widthCm: 120,
          lengthCm: 180,
          depthCm: 30,
          confidence: 0.8,
          description: "Wooden raised bed, back left",
          positionXCm: 40,
          positionYCm: 20,
        },
        {
          type: "pot",
          sizeValue: 25,
          sizeUnit: "cm",
          widthCm: null,
          lengthCm: null,
          depthCm: null,
          confidence: 0.8,
          description: "Terracotta pot",
          // A pot is portable, not fixed in place — this estimated
          // position should never become a real saved one.
          positionXCm: 220,
          positionYCm: 150,
        },
      ],
      summary: "Found a raised bed and a pot.",
      plotWidthCm: 300,
      plotLengthCm: 200,
      plotBoundaryConfidence: 0.8,
    });

    await page.goto(`/garden/estimate/${estimationId}`);
    // The plot's own width/length fields are first in the DOM, before any
    // area row's — the raised bed row below shares the same field labels.
    await expect(page.getByLabel("Width (cm)").first()).toHaveValue("300");
    await expect(page.getByLabel("Length (cm)").first()).toHaveValue("200");
    // The fixed-type note only shows for the bed, never the pot.
    await expect(page.getByText(/Placed on your plot planner at the spot estimated/)).toHaveCount(1);

    await page.getByRole("button", { name: /Add \d+ areas? to my garden/ }).click();
    await expect(page).toHaveURL(/\/garden$/);

    // Data-level check first — exact stored cm position, unaffected by any
    // display-only rendering clamp the canvas applies.
    const bedRows = await getGrowingAreasByType(email, "raised_bed");
    expect(bedRows).toHaveLength(1);
    expect(bedRows[0].positionXCm).toBe(40);
    expect(bedRows[0].positionYCm).toBe(20);
    const potRows = await getGrowingAreasByType(email, "pot");
    expect(potRows).toHaveLength(1);
    expect(potRows[0].positionXCm).toBeNull();
    expect(potRows[0].positionYCm).toBeNull();

    // Behavioural check — the bed renders as an already-confirmed
    // placement, the pot as a proposal the layout canvas is free to
    // suggest (and place) wherever fits, working around the bed.
    await page.goto("/garden/layout");
    await expect(page.locator(`${PLACED_ITEM}[title*="Raised bed"]`)).toHaveCount(1);
    await expect(page.locator(`${SUGGESTED_ITEM}[title*="Pot"]`)).toHaveCount(1);
  });

  test("adding a greenhouse with a height via AddAreaForm persists it, and two different-height greenhouses stay as separate set-aside cards", async ({
    page,
  }) => {
    const { email } = await signUpAndOnboard(page);
    await page.goto("/garden/layout");
    await page.getByLabel("Width (cm)").fill("1000");
    await page.getByLabel("Length (cm)").fill("800");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    const plot = page.locator(".border-dashed").first();

    // Greenhouse is a WALKWAY_TYPES + HEIGHT_TYPES member — selecting it
    // should reveal the Height (cm) input (gated by hasHeight(type)) that a
    // pot/seed_tray never shows, and hide the Depth (cm) input (gated by
    // hasDepth(type)) — a greenhouse is a structure described fully by
    // width/length/height, not something planted at a soil depth.
    await page.getByLabel("Type").selectOption("greenhouse");
    await page.getByLabel("Width (cm)").fill("200");
    await page.getByLabel("Length (cm)").fill("300");
    await expect(page.getByLabel("Height (cm)")).toBeVisible();
    await expect(page.getByLabel("Depth (cm)")).toHaveCount(0);
    await page.getByLabel("Height (cm)").fill("210");
    await page.getByRole("button", { name: "+ Add growing area" }).click();

    const suggested = page.locator(SUGGESTED_ITEM).first();
    await expect(suggested).toBeVisible();
    await expect(suggested).toHaveAttribute("title", /210cm tall/);
    await dragTo(page, suggested, plot, centerOf);
    await expect(page.locator(`${PLACED_ITEM}[title*="210cm tall"]`)).toHaveCount(1);

    // Reload proves the height actually reached the database via
    // addGrowingAreaFromLayoutAction, not just the client's own optimistic
    // state — this closes the gap the first design draft missed entirely.
    await page.reload();
    await expect(page.locator(`${PLACED_ITEM}[title*="210cm tall"]`)).toHaveCount(1);
    const rows = await getGrowingAreasByType(email, "greenhouse");
    expect(rows).toHaveLength(1);
    expect(rows[0].heightCm).toBe(210);

    // A second greenhouse with the SAME footprint but a DIFFERENT height,
    // set aside straight away — groupSetAside's dedup key includes heightCm,
    // so these two must render as two separate cards, never merged into one
    // "×2" card the way two truly-identical areas would.
    await page.getByLabel("Type").selectOption("greenhouse");
    await page.getByLabel("Width (cm)").fill("200");
    await page.getByLabel("Length (cm)").fill("300");
    await page.getByLabel("Height (cm)").fill("260");
    await page.getByRole("button", { name: "+ Add growing area" }).click();
    const secondSuggested = page.locator(SUGGESTED_ITEM).first();
    await expect(secondSuggested).toBeVisible();
    await dragTo(page, secondSuggested, plot, belowPlot);

    const setAsideGreenhouse = page.locator(`${SET_ASIDE_ITEM}[title*="Greenhouse"]`);
    await expect(setAsideGreenhouse).toHaveCount(1);
    await expect(setAsideGreenhouse).toHaveAttribute("title", /260cm tall/);
  });

  test("confirming a photo estimate with two same-footprint, different-height greenhouses persists both heights distinctly", async ({
    page,
  }) => {
    const { email } = await signUpAndOnboard(page);

    // Regression test for a real bug the Plan-agent review caught:
    // equipmentGroupKey originally didn't include heightCm, so two
    // greenhouses estimated with matching width/length but different
    // heights would silently collapse into one userEquipment group and one
    // instance's real height would be discarded.
    const estimationId = await addCompletedEstimation(email, {
      areas: [
        {
          type: "greenhouse",
          sizeValue: null,
          sizeUnit: null,
          widthCm: 200,
          lengthCm: 300,
          depthCm: null,
          heightCm: 180,
          confidence: 0.8,
          description: "Greenhouse, back of the garden",
          positionXCm: null,
          positionYCm: null,
        },
        {
          type: "greenhouse",
          sizeValue: null,
          sizeUnit: null,
          widthCm: 200,
          lengthCm: 300,
          depthCm: null,
          heightCm: 250,
          confidence: 0.8,
          description: "Greenhouse, side of the garden",
          positionXCm: null,
          positionYCm: null,
        },
      ],
      summary: "Found two greenhouses.",
      plotWidthCm: 1000,
      plotLengthCm: 800,
      plotBoundaryConfidence: 0.8,
    });

    await page.goto(`/garden/estimate/${estimationId}`);
    await expect(page.getByLabel("Height (cm)").nth(0)).toHaveValue("180");
    await expect(page.getByLabel("Height (cm)").nth(1)).toHaveValue("250");

    await page.getByRole("button", { name: /Add \d+ areas? to my garden/ }).click();
    await expect(page).toHaveURL(/\/garden$/);

    const rows = await getGrowingAreasByType(email, "greenhouse");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.heightCm).sort()).toEqual([180, 250]);
  });

  test("rotating a placed area in 90° increments swaps its rendered footprint and persists", async ({ page }) => {
    const { email } = await signUpAndOnboard(page);
    await page.goto("/garden/layout");
    await page.getByLabel("Width (cm)").fill("1000");
    await page.getByLabel("Length (cm)").fill("800");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    const plot = page.locator(".border-dashed").first();

    // A planter with clearly distinct width/length so rotation visibly
    // swaps its rendered box — a square footprint would make a rotation
    // bug invisible.
    await page.getByLabel("Type").selectOption("planter");
    await page.getByLabel("Width (cm)").fill("200");
    await page.getByLabel("Length (cm)").fill("100");
    await page.getByRole("button", { name: "+ Add growing area" }).click();
    const suggested = page.locator(SUGGESTED_ITEM).first();
    await expect(suggested).toBeVisible();
    await dragTo(page, suggested, plot, centerOf);

    const placedItem = page.locator(PLACED_ITEM).first();
    await expect(placedItem).toBeVisible();
    // scale = min(640/1000, 480/800, 3) = 0.6 for this 1000x800 plot —
    // 200x100cm renders as 120x60px before any rotation.
    const beforeBox = await placedItem.boundingBox();
    if (!beforeBox) throw new Error("missing box");
    expect(beforeBox.width).toBeCloseTo(120, 0);
    expect(beforeBox.height).toBeCloseTo(60, 0);

    // Pots/seed trays never show a rotate control (rotation is a no-op for
    // their sizeValue-based square footprint) — only a width/length-sized
    // type like this planter does.
    const rotateButton = page.getByRole("button", { name: /^Rotate/ });
    await expect(rotateButton).toBeVisible();
    await rotateButton.click();

    const afterBox = await placedItem.boundingBox();
    if (!afterBox) throw new Error("missing box");
    expect(afterBox.width).toBeCloseTo(60, 0);
    expect(afterBox.height).toBeCloseTo(120, 0);

    // Reload proves rotationDeg actually reached the database via
    // setGrowingAreaRotationAction, not just optimistic client state.
    await page.reload();
    const afterReloadBox = await page.locator(PLACED_ITEM).first().boundingBox();
    if (!afterReloadBox) throw new Error("missing box");
    expect(afterReloadBox.width).toBeCloseTo(60, 0);
    expect(afterReloadBox.height).toBeCloseTo(120, 0);

    const rows = await getGrowingAreasByType(email, "planter");
    expect(rows).toHaveLength(1);
    expect(rows[0].rotationDeg).toBe(90);
  });

  test("dragging an area onto the plot snaps its saved position to the grid", async ({ page }) => {
    const { email } = await signUpAndOnboard(page);
    await page.goto("/garden/layout");
    await page.getByLabel("Width (cm)").fill("1000");
    await page.getByLabel("Length (cm)").fill("800");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();

    const plot = page.locator(".border-dashed").first();
    const SCALE = 0.6;

    await page.getByLabel("Size").fill("25");
    await page.getByRole("button", { name: "+ Add growing area" }).click();
    const suggested = page.locator(SUGGESTED_ITEM).first();
    await expect(suggested).toBeVisible();
    // Deliberately not a multiple of the 15cm grid — the drop point itself
    // is arbitrary, only the resulting SAVED position should land on-grid.
    await dragTo(page, suggested, plot, (box) => ({ x: box.x + 2 + 203 * SCALE, y: box.y + 2 + 107 * SCALE }));

    await expect(page.locator(PLACED_ITEM)).toHaveCount(1);
    const rows = await getGrowingAreasByType(email, "pot");
    expect(rows).toHaveLength(1);
    expect(rows[0].positionXCm).not.toBeNull();
    expect(rows[0].positionYCm).not.toBeNull();
    expect(rows[0].positionXCm! % 15).toBe(0);
    expect(rows[0].positionYCm! % 15).toBe(0);
  });

  test("an already-set plot's size can be edited afterward, and cancelling an edit leaves the saved size untouched", async ({
    page,
  }) => {
    await signUpAndOnboard(page);
    await page.goto("/garden/layout");
    await page.getByLabel("Width (cm)").fill("1000");
    await page.getByLabel("Length (cm)").fill("800");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Set your plot size")).toBeHidden();
    await expect(page.getByText("Plot size: 1000×800cm")).toBeVisible();

    // Cancelling a started edit leaves the previously saved size in place —
    // typing a new value into the form must not itself persist anything.
    await page.getByRole("button", { name: "Edit size" }).click();
    await expect(page.getByText("Resize your plot")).toBeVisible();
    await expect(page.getByLabel("Width (cm)")).toHaveValue("1000");
    await expect(page.getByLabel("Length (cm)")).toHaveValue("800");
    await page.getByLabel("Width (cm)").fill("250");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Resize your plot")).toBeHidden();
    await expect(page.getByText("Plot size: 1000×800cm")).toBeVisible();

    // A real save does take effect — pre-filled from the current size, not
    // starting blank the way first-time setup does.
    await page.getByRole("button", { name: "Edit size" }).click();
    await page.getByLabel("Width (cm)").fill("600");
    await page.getByLabel("Length (cm)").fill("500");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Resize your plot")).toBeHidden();
    await expect(page.getByText("Plot size: 600×500cm")).toBeVisible();
  });
});
