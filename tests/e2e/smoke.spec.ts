import { expect, test } from "@playwright/test";

test("homepage loads in signed-out preview mode", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/DiscStacked/i);
  await expect(page.getByRole("heading", { name: /Welcome to DiscStacked/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Try It Out/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sign In$/i }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Interactive Preview/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Movies/i })).toBeVisible();
});

test("auth page renders email/password sign in", async ({ page }) => {
  await page.goto("/auth");

  await expect(page.getByText("Sign in to your collection")).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
});

test("legal pages render successfully", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByText("Terms of Service").first()).toBeVisible();
  await expect(page.getByText(/support@discstacked\.app/i)).toBeVisible();

  await page.goto("/privacy");
  await expect(page.getByText("Privacy Policy").first()).toBeVisible();
  await expect(page.getByText(/support@discstacked\.app/i).first()).toBeVisible();
});

test("missing shared collection token shows not found state", async ({ page }) => {
  await page.goto("/share/test");

  await expect(page.getByText("Collection not found")).toBeVisible({ timeout: 15000 });
});

test("unknown routes fall back to the 404 page", async ({ page }) => {
  await page.goto("/this-route-does-not-exist");

  await expect(page.getByText("404")).toBeVisible();
  await expect(page.getByText("Oops! Page not found")).toBeVisible();
  await expect(page.getByRole("link", { name: /return to home/i })).toBeVisible();
});
