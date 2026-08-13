import { test, expect } from "@playwright/test";
import { signUpAndOnboard, uniqueTestEmail, TEST_PASSWORD } from "./helpers/auth";

test.describe("auth", () => {
  test("visiting a protected route while logged out redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("signup creates an account and lands in onboarding", async ({ page }) => {
    const email = uniqueTestEmail("signup");
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    // Signup auto-signs in and redirects to /dashboard, which itself
    // redirects to onboarding since the fresh profile has no
    // onboardingCompletedAt yet.
    await expect(page).toHaveURL(/\/onboarding\/location/);
  });

  test("signup rejects a duplicate email", async ({ page }) => {
    const email = uniqueTestEmail("dup");
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding\/location/);

    // Sign out (redirects to "/", see layout.tsx's signOutAction), then
    // attempt to sign up again with the same email.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("An account with that email already exists.")).toBeVisible();
  });

  test("login with the wrong password shows an error and does not sign in", async ({ page }) => {
    const email = uniqueTestEmail("wrongpw");
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding\/location/);
    await page.getByRole("button", { name: "Sign out" }).click();

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid|incorrect|credentials/i)).toBeVisible();
  });

  test("login with correct credentials signs in, and sign out ends the session", async ({ page }) => {
    const email = uniqueTestEmail("login");
    await page.goto("/signup");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/onboarding\/location/);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    // Still-incomplete onboarding from the earlier signup, so this lands
    // back in the onboarding flow rather than the dashboard — confirms the
    // session round-trips to the same account, not just "some" session.
    await expect(page).toHaveURL(/\/onboarding/);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    // A protected route, unlike "/", genuinely does bounce a logged-out
    // visitor to /login (see the very first test in this file).
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("onboarded user via signUpAndOnboard helper", () => {
  test("full flow lands an onboarded user on the dashboard", async ({ page }) => {
    const { email } = await signUpAndOnboard(page);
    await expect(page).toHaveURL(/\/dashboard/);
    // Matches both the header's account-email chip and the "Welcome, {email}"
    // heading — either is fine confirmation, so just check at least one.
    await expect(page.getByText(email).first()).toBeVisible();
  });
});
