// Renders the PNG icons and the Open Graph share image from HTML.
// Usage: node scripts/make-assets.mjs   (writes into public/)
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(`node_modules/@fontsource-variable/${pkg}/files/${file}`).toString("base64")}`;
const fonts = `
@font-face{font-family:Sora;src:url(${font("sora", "sora-latin-wght-normal.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Inter;src:url(${font("inter", "inter-latin-wght-normal.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Inter;src:url(${font("inter", "inter-latin-ext-wght-normal.woff2")}) format("woff2");font-weight:100 900;unicode-range:U+0100-02BA,U+20A0-20AB}`;

const mark = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0B2545"/><rect x="8.5" y="9" width="3" height="14" rx="1.5" fill="#fff"/><rect x="14.5" y="9" width="3" height="14" rx="1.5" fill="#fff"/><rect x="20.5" y="12" width="3" height="11" rx="1.5" fill="#fff"/><circle cx="24.5" cy="7.5" r="3" fill="#F5B700"/></svg>`;

const og = `<!doctype html><html><head><style>${fonts}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:#0B2545;font-family:Inter;color:#fff;display:flex;padding:72px;gap:56px;align-items:center}
.l{flex:1}
.brand{display:flex;align-items:center;gap:14px;font:600 30px Sora}
.brand svg rect:first-child{fill:#fff}.brand svg rect:not(:first-child){fill:#0B2545}
h1{font:700 60px/66px Sora;letter-spacing:-1.2px;margin-top:56px}
p{font-size:24px;line-height:34px;color:#C5D3E6;margin-top:22px}
.card{width:440px;background:#fff;border-radius:18px;padding:32px;color:#0B1A30}
.k{font-size:17px;font-weight:600;color:#51627A}
.t{font-size:46px;font-weight:700;letter-spacing:-1px;color:#0B2545;margin-top:4px;font-variant-numeric:tabular-nums}
.t span{font-size:25px;color:#51627A}
.s{font-size:16px;color:#51627A;margin-top:2px}
.bar{position:relative;display:flex;height:56px;border:2px solid #0B2545;margin-top:26px;background:#eef2f8}
.bar i{display:block;height:100%}
.ridges{position:absolute;inset:0 30px 0 0;background:repeating-linear-gradient(90deg,transparent 0 7px,rgba(11,37,69,.16) 7px 8px,rgba(255,255,255,.14) 8px 9px,transparent 9px 12px)}
.door{width:30px;border-left:2px solid #0B2545;background:#dfe6f0;display:flex;justify-content:space-evenly}
.door b{width:3px;margin:6px 0;border-radius:3px;background:rgba(11,37,69,.7)}
.c{position:absolute;width:8px;height:8px;background:#0B2545}
.rows{margin-top:22px;font-size:16px}
.row{display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #DDE4EE;font-variant-numeric:tabular-nums}
.row b{font-weight:600}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:10px}
</style></head><body>
<div class="l"><div class="brand">${mark(48)} PortWise</div>
<h1>Know your true import cost before you ship.</h1>
<p>Duty, levies, VAT and today's exchange rate, itemized in naira.</p></div>
<div class="card"><div class="k">Your estimated landed cost</div>
<div class="t">₦10,400,221<span>.88</span></div><div class="s">20 × Smartphones, HS 8517.13</div>
<div class="bar"><i style="width:70.4%;background:#1D5FD1"></i><i style="width:14.1%;background:#F5B700;box-shadow:inset 0 0 0 1px #B07A00"></i><i style="width:2%;background:#C93B31"></i><i style="width:6.5%;background:#6D4AE0"></i><span class="ridges"></span><span class="door"><b></b><b></b></span>
<span class="c" style="left:-2px;top:-2px"></span><span class="c" style="right:-2px;top:-2px"></span><span class="c" style="left:-2px;bottom:-2px"></span><span class="c" style="right:-2px;bottom:-2px"></span></div>
<div class="rows">
<div class="row"><span><i class="dot" style="background:#1D5FD1"></i>Customs value</span><b>₦7,875,000.00</b></div>
<div class="row"><span><i class="dot" style="background:#F5B700"></i>Import duty</span><b>₦1,575,000.00</b></div>
<div class="row"><span><i class="dot" style="background:#C93B31"></i>Levies</span><b>₦224,625.00</b></div>
<div class="row" style="border:0"><span><i class="dot" style="background:#6D4AE0"></i>VAT</span><b>₦725,596.88</b></div>
</div></div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();

for (const [size, file] of [
  [32, "favicon-32.png"],
  [180, "apple-touch-icon.png"],
  [512, "icon-512.png"],
]) {
  await page.setViewportSize({ width: size, height: size });
  // The touch icon gets a little padding so iOS rounding doesn't clip the dot.
  const pad = size >= 180 ? Math.round(size * 0.08) : 0;
  await page.setContent(
    `<body style="margin:0;background:#0B2545;width:${size}px;height:${size}px;display:grid;place-items:center">${mark(size - pad * 2)}</body>`,
  );
  await page.screenshot({ path: `public/${file}`, omitBackground: size === 32 });
}

await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(og);
await page.waitForTimeout(300);
await page.screenshot({ path: "public/og.png" });
await browser.close();
console.log("Wrote favicon-32.png, apple-touch-icon.png, icon-512.png, og.png");
