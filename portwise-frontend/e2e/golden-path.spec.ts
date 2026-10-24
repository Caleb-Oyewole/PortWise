import { expect, test } from "@playwright/test";

const demo = process.env.BASE_URL ? "" : "?demo=1";

test("importer gets an itemized landed cost", async ({ page }) => {
  await page.goto("/" + demo);
  await page.getByRole("combobox", { name: /product or hs code/i }).click();
  await page.getByRole("option", { name: /^smartphones/i }).click();
  await page.getByLabel(/price per unit/i).fill("250");
  await page.getByLabel(/quantity/i).fill("20");
  await page.getByRole("button", { name: /add shipping and insurance/i }).click();
  await page.getByLabel(/shipping and insurance/i).fill("250");
  await page.getByRole("button", { name: /calculate landed cost/i }).click();

  await expect(page.getByRole("heading", { name: /your estimated landed cost/i })).toBeFocused();
  await expect(page.getByRole("row", { name: /^import duty/i })).toBeVisible();
  await expect(page.getByRole("row", { name: /vat/i })).toBeVisible();
  await expect(page).toHaveURL(/i=12~250~USD~20~250~/);
  if (demo) await expect(page.getByRole("cell", { name: "₦10,400,221.88" })).toBeVisible();
});

test("validation explains what to fix and focuses the first field", async ({ page }) => {
  await page.goto("/" + demo);
  await page.getByRole("button", { name: /calculate landed cost/i }).click();
  await expect(page.getByText("Choose a product or HS code.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: /product or hs code/i })).toBeFocused();
});

test("a preset fills the form and calculates", async ({ page }) => {
  await page.goto("/" + demo);
  await page.getByRole("button", { name: /phones from dubai/i }).click();
  await expect(page.getByRole("combobox", { name: /product or hs code/i })).toHaveValue("Smartphones");
  await expect(page.getByRole("heading", { name: /your estimated landed cost/i })).toBeVisible();
});

test("a shared link restores the exact result", async ({ page }) => {
  await page.goto(`/?i=12~250~USD~20~250~${demo ? "&demo=1" : ""}`);
  await expect(page.getByRole("heading", { name: /your estimated landed cost/i })).toBeVisible();
  await expect(page.getByLabel(/price per unit/i)).toHaveValue("250.00");
});

test("shows a friendly message when live rates are down", async ({ page }) => {
  if (demo) {
    // The mock API runs in a service worker, which page.route cannot see; use its failure switch.
    await page.goto("/?demo=1&mockfail=FX_UNAVAILABLE");
  } else {
    await page.route("**/calculate", (r) =>
      r.fulfill({ status: 503, json: { error: { code: "FX_UNAVAILABLE", message: "x" } } }),
    );
    await page.goto("/");
  }
  await page.getByRole("combobox", { name: /product or hs code/i }).fill("8517");
  await page.getByRole("option", { name: /smartphones/i }).waitFor();
  await page.keyboard.press("Enter");
  await page.getByLabel(/price per unit/i).fill("100");
  await page.getByRole("button", { name: /calculate landed cost/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: /live rates are unavailable/i })).toBeVisible();
  await expect(page.getByLabel(/price per unit/i)).toHaveValue("100.00"); // inputs are never lost
});
