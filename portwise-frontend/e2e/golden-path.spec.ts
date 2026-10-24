import { expect, test } from "@playwright/test";

// Without BASE_URL these run against a local preview build in demo mode (mock API).
// With BASE_URL they run against a deployed site and its real API.
const demo = process.env.BASE_URL ? "" : "?demo=1";
const withDemo = (path: string) => (demo ? `${path}${path.includes("?") ? "&" : "?"}demo=1` : path);

test("importer gets an itemized landed cost", async ({ page }) => {
  await page.goto(withDemo("/"));
  await page.getByRole("combobox", { name: /product or hs code/i }).click();
  await page.getByRole("option", { name: /^smartphones/i }).click();
  await page.getByLabel(/price per unit/i).fill("250");
  await page.getByLabel(/quantity/i).fill("20");
  await page.getByLabel(/^freight and insurance/i).fill("250");
  await page.getByRole("button", { name: /calculate landed cost/i }).click();

  await expect(page.getByRole("heading", { name: /your estimated landed cost/i })).toBeFocused({ timeout: 20_000 });
  await expect(page.getByRole("row", { name: /^import duty/i })).toBeVisible();
  await expect(page.getByRole("row", { name: /^vat/i })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: /levy regime/i })).toBeVisible(); // both regimes compared
  await expect(page.getByRole("heading", { name: /if the naira moves/i })).toBeVisible();
  await expect(page).toHaveURL(/i=8517\.13~250~USD~20~CN/);
});

test("validation explains what to fix and focuses the first field", async ({ page }) => {
  await page.goto(withDemo("/"));
  await page.getByRole("button", { name: /calculate landed cost/i }).click();
  await expect(page.getByText("Choose a product or HS code.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: /product or hs code/i })).toBeFocused();
});

test("a preset fills the form and calculates", async ({ page }) => {
  await page.goto(withDemo("/"));
  await page.getByRole("button", { name: /phones from dubai/i }).click();
  await expect(page.getByRole("combobox", { name: /product or hs code/i })).toHaveValue("Smartphones");
  await expect(page.getByRole("heading", { name: /your estimated landed cost/i })).toBeVisible({ timeout: 20_000 });
});

test("a shared link restores the exact result", async ({ page }) => {
  await page.goto(withDemo("/?i=8517.13~250~USD~20~AE&f=250~USD"));
  await expect(page.getByRole("heading", { name: /your estimated landed cost/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel(/price per unit/i)).toHaveValue("250.00");
  await expect(page.getByLabel(/shipped from/i)).toHaveValue("AE");
});

test("a business-rule rejection is explained and inputs are kept", async ({ page }) => {
  if (demo) {
    // The mock API runs in a service worker, which page.route cannot see; use its failure switch.
    await page.goto("/?demo=1&mockfail=prohibited_item");
  } else {
    await page.route("**/api/v1/calculate/multi", (r) =>
      r.fulfill({ status: 400, json: { success: false, code: "prohibited_item", detail: "Item 1: Prohibited from non-ECOWAS origins." } }),
    );
    await page.goto("/");
  }
  await page.getByRole("combobox", { name: /product or hs code/i }).fill("8517");
  await page.getByRole("option", { name: /smartphones/i }).waitFor();
  await page.keyboard.press("Enter");
  await page.getByLabel(/price per unit/i).fill("100");
  await page.getByRole("button", { name: /calculate landed cost/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: /can't be imported from there/i })).toBeVisible();
  await expect(page.getByLabel(/price per unit/i)).toHaveValue("100.00"); // inputs are never lost
});
