// Drives the admin dashboard end to end against a running API and takes screenshots.
// It proves the demo moment: an admin adds a tariff and the calculator offers it.
// Usage: node scripts/admin-walkthrough.mjs [baseUrl] [email] [password]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:5173";
const email = process.argv[3] ?? "admin@portwise.local";
const password = process.argv[4] ?? "portwise-admin";
const out = "screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
p.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
const shot = (name, full = true) => p.screenshot({ path: `${out}/admin-${name}.png`, fullPage: full });

await p.goto(`${base}/admin`);
await p.getByLabel("Email").fill(email);
await p.getByLabel("Password").fill("wrong-password");
await p.getByRole("button", { name: "Sign in" }).click();
await p.getByText(/do not match/i).waitFor();
await shot("1-login-error", false);
await p.getByLabel("Password").fill(password);
await p.getByRole("button", { name: "Sign in" }).click();
await p.getByRole("heading", { name: /welcome/i }).waitFor();
await p.waitForTimeout(800);
await shot("2-overview");

await p.getByRole("link", { name: "Tariffs" }).click();
await p.getByRole("heading", { name: "Tariffs" }).waitFor();
await p.waitForTimeout(800);
await shot("3-tariffs");

const code = `8523.${String(Date.now()).slice(-2).padStart(2, "5")}`;
await p.getByRole("button", { name: "Add HS code" }).click();
const dlg = p.getByRole("dialog");
await dlg.getByLabel("HS code", { exact: true }).fill(code);
await dlg.getByLabel("Product description").fill("USB flash drives");
await dlg.getByLabel("Category", { exact: true }).fill("Phones and electronics");
await dlg.getByLabel(/search words/i).fill("flash drive pendrive memory stick");
await dlg.getByLabel("Import duty (%)").fill("10");
await dlg.getByLabel("Source reference").fill("ECOWAS CET 2022-27 (demo entry)");
await shot("4-add-dialog", false);
await dlg.getByRole("button", { name: "Add HS code" }).click();
await p.getByText(`Added HS ${code}`).waitFor();
await shot("5-added", false);

await p.getByRole("link", { name: "Levies and VAT" }).click();
await p.getByRole("heading", { name: "Levies and VAT" }).waitFor();
await p.waitForTimeout(500);
await shot("6-levies");

await p.getByRole("link", { name: "Exchange rates" }).click();
await p.getByRole("heading", { name: "Exchange rates" }).waitFor();
await p.waitForTimeout(500);
await shot("7-fx");

await p.getByRole("link", { name: "Import" }).click();
await p.getByRole("button", { name: "Preview the catalog" }).click();
await p.getByRole("heading", { name: /preview: 2026 tariff catalog/i }).waitFor();
await shot("8-import-preview");

await p.getByRole("link", { name: "Activity" }).click();
await p.getByRole("heading", { name: "Activity" }).waitFor();
await p.waitForTimeout(500);
await shot("9-activity");

// The demo moment: the new product is offered in the calculator.
const calc = await ctx.newPage();
await calc.goto(`${base}/`);
await calc.getByRole("combobox", { name: /product or hs code/i }).fill("flash");
await calc.getByRole("option", { name: new RegExp(`HS ${code.replace(".", "\\.")}`)}).waitFor({ timeout: 15000 });
await calc.screenshot({ path: `${out}/admin-10-calculator-has-new-code.png` });
console.log(`Added ${code}; calculator offers it.`);

await browser.close();
console.log(errors.length ? errors.join("\n") : "No page errors.");
