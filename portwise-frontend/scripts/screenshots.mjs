// Captures the main states at phone and desktop widths, and reports console errors.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const errors = [];

async function page(width, height, name) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(`[${name}] ${m.type()}: ${m.text()}`));
  p.on("pageerror", (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  return { p, ctx };
}
const shot = (p, file, full = true) => p.screenshot({ path: `${out}/${file}.png`, fullPage: full });

for (const [w, h, tag] of [
  [1440, 900, "desktop"],
  [360, 740, "mobile"],
]) {
  const { p, ctx } = await page(w, h, tag);
  await p.goto(base + "/");
  await p.getByRole("button", { name: /phones from dubai/i }).waitFor();
  await p.waitForTimeout(400);
  await shot(p, `${tag}-1-idle`);

  // Validation: submit an empty form.
  await p.getByRole("button", { name: /calculate landed cost/i }).click();
  await p.waitForTimeout(300);
  await shot(p, `${tag}-2-validation`, false);

  // Combobox search.
  await p.getByRole("combobox", { name: /product or hs code/i }).fill("phone");
  await p.waitForTimeout(200);
  await shot(p, `${tag}-3-combobox`, false);
  await p.keyboard.press("Escape");

  // Preset → result.
  await p.getByRole("button", { name: /phones from dubai/i }).click();
  await p
    .getByRole("cell", { name: "₦10,400,221.88" })
    .waitFor({ timeout: 8000 })
    .catch(async (e) => {
      await shot(p, `${tag}-FAIL`);
      throw e;
    });
  await p.waitForTimeout(600);
  await shot(p, `${tag}-4-result`);

  await p.getByRole("button", { name: /show the math/i }).click();
  await p.waitForTimeout(200);
  await shot(p, `${tag}-5-math`);

  await p.getByRole("button", { name: /parts from germany/i }).click();
  await p.waitForTimeout(1500);
  await shot(p, `${tag}-6-multi`);
  await ctx.close();
}

{
  const { p, ctx } = await page(1440, 900, "how");
  await p.goto(base + "/how-it-works");
  await p.waitForTimeout(1500);
  await shot(p, "desktop-7-how-it-works");
  await p.goto(base + "/nope");
  await p.waitForTimeout(300);
  await shot(p, "desktop-8-404", false);
  await ctx.close();
}

{
  const { p, ctx } = await page(1440, 900, "fail");
  await p.goto(base + "/?mockfail=FX_UNAVAILABLE");
  await p.getByRole("button", { name: /phones from dubai/i }).click();
  await p.waitForTimeout(1500);
  await shot(p, "desktop-9-fx-error", false);
  await p.goto(base + "/?mockfail=off");
  await ctx.close();
}

await browser.close();
console.log(errors.length ? errors.join("\n") : "No console errors or warnings.");
