import type { Page } from "@playwright/test";

/**
 * Every test user gets this prefix so global-teardown.ts can safely delete
 * exactly (and only) what these tests created — never the demo account or
 * any real data. See global-teardown.ts.
 */
export const TEST_EMAIL_PREFIX = "pw-test-";
export const TEST_PASSWORD = "playwright-test-password-1";

export function uniqueTestEmail(label: string): string {
  return `${TEST_EMAIL_PREFIX}${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@edurnity-test.local`;
}

/** A real, stable, always-valid UK postcode (Buckingham Palace) — the
 * onboarding location step calls the live postcodes.io API (no key
 * required), so this is a genuine external dependency, not stubbed. */
const TEST_POSTCODE = "SW1A 1AA";

export type OnboardOptions = {
  /** Add one pot of growing space during the equipment step — needed by
   * tests that require an available growing area (e.g. grow-plan
   * generation). Defaults to false (equipment step is skipped, matching the
   * app's own "equipment ownership is optional" design). */
  addPotEquipment?: boolean;
};

/**
 * Signs up a brand-new, uniquely-emailed user and drives it through all six
 * onboarding steps (see src/lib/onboarding/steps.ts for the canonical
 * order), landing on /dashboard. Every test file that needs a logged-in,
 * onboarded user should create its OWN user via this helper (once per file,
 * in beforeAll, saving storageState — see any *.spec.ts for the pattern)
 * rather than sharing one across files: Playwright runs spec files in
 * parallel workers, and two files mutating the same account's seeds/tasks/
 * equipment concurrently would be a real source of flaky interference.
 */
export async function signUpAndOnboard(
  page: Page,
  { addPotEquipment = false }: OnboardOptions = {},
): Promise<{ email: string; password: string }> {
  const email = uniqueTestEmail("user");
  const password = TEST_PASSWORD;

  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("**/onboarding/location");
  await page.getByLabel("Postcode").fill(TEST_POSTCODE);
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("**/onboarding/crops");
  await page.getByRole("link", { name: "Skip for now" }).click();

  await page.waitForURL("**/onboarding/plot");
  await page.getByLabel("Medium garden").check();
  await page.getByLabel("Average hours of sunlight per day").fill("5");
  await page.getByLabel("People in your household").fill("2");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("**/onboarding/equipment");
  if (addPotEquipment) {
    await page.getByRole("button", { name: "+ Add pots" }).click();
    // getByLabel("Size") would be ambiguous — that <label> wraps both the
    // number input and the cm/litres <select>, so it's scoped by
    // placeholder instead.
    await page.getByPlaceholder("e.g. 20").fill("30");
    await page.getByLabel("Quantity").fill("1");
  }
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("**/onboarding/seeds");
  await page.getByRole("link", { name: "Skip for now" }).click();

  await page.waitForURL("**/onboarding/experience");
  await page.getByLabel("Beginner").check();
  await page.getByLabel("Hours you can spend gardening on a weekday").fill("1");
  await page.getByLabel("Hours you can spend gardening on a weekend day").fill("3");
  await page.getByRole("button", { name: "Finish setup" }).click();

  await page.waitForURL("**/dashboard");

  return { email, password };
}
