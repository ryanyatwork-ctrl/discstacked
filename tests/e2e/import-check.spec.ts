import { expect, test } from "@playwright/test";

test("movie import checks the complete list before saving", async ({ page }) => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const userId = "11111111-1111-4111-8111-111111111111";
  const accessToken = [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: userId, aud: "authenticated", role: "authenticated", exp: expiresAt }),
    "synthetic-signature",
  ].join(".");

  await page.addInitScript(({ accessToken, expiresAt, userId }) => {
    const session = JSON.stringify({
      access_token: accessToken,
      refresh_token: "synthetic-refresh-token",
      expires_in: 3600,
      expires_at: expiresAt,
      token_type: "bearer",
      user: {
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
        identities: [],
        created_at: new Date().toISOString(),
      },
    });
    localStorage.setItem("sb-ykyneinxsgcdjejmlxkg-auth-token", session);
    localStorage.setItem("sb-uehokbnqudoabjfzcfaj-auth-token", session);
  }, { accessToken, expiresAt, userId });

  await page.route("**/rest/v1/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "content-range": "0-0/0" },
      body: "[]",
    });
  });

  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Import to Movies" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "mark-bluray.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "Title,Format,UPC/EAN,Digital Copy",
      "Arrival,Blu-ray + Digital,032429252957,Yes",
      "Blade Runner 2049,4K + Blu-ray,,No",
      "Dune,Blu-ray,883929701056,No",
      "Arrival,Blu-ray,032429252964,No",
      "Capote / In Cold Blood,Blu-ray,043396541436,No",
    ].join("\n")),
  });

  await expect(page.getByText("5 parsed source rows → 5 prepared import items")).toBeVisible();
  await expect(page.getByText("4 prepared items with barcodes · 1 without barcodes")).toBeVisible();
  await page.getByRole("button", { name: "Check this list" }).click();
  await expect(page.getByText("List is safe to import")).toBeVisible();
  await expect(page.getByText("one prepared item per source row")).toBeVisible();
  await expect(page.getByText("Blade Runner 2049").last()).toBeVisible();
  await expect(page.locator('input[value="Capote / In Cold Blood"]')).toBeVisible();
  await expect(page.getByText(/No barcode\. The item can still import/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Download full check report/ })).toBeVisible();
  await expect(page.locator(".vite-error-overlay")).toHaveCount(0);
  const applicationErrors = consoleErrors.filter((message) => !message.startsWith("Failed to load resource:"));
  expect(applicationErrors).toEqual([]);
});
