// Serves dist/ with the production security headers (parsed from security-headers.inc.template)
// and drives the calculator, a calculation and the admin sign-in page in a browser,
// failing on any Content-Security-Policy violation or page error.
// Usage: npm run build && node scripts/csp-check.mjs http://localhost:8000
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { chromium } from "@playwright/test";

const apiOrigin = process.argv[2] ?? "http://localhost:8000";
const headers = Object.fromEntries(
  [...readFileSync("security-headers.inc.template", "utf8").matchAll(/^add_header ([\w-]+) "(.*)" always;$/gm)].map(([, k, v]) => [
    k,
    v.replace("${API_ORIGIN}", apiOrigin),
  ]),
);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json", ".txt": "text/plain" };

const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = join("dist", path);
  if (!existsSync(file) || statSync(file).isDirectory()) file = join("dist", "index.html"); // SPA fallback
  res.writeHead(200, { ...headers, "Content-Type": types[extname(file)] ?? "application/octet-stream" });
  res.end(readFileSync(file));
}).listen(4300);

const violations = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && violations.push(m.text()));
page.on("pageerror", (e) => violations.push(`pageerror: ${e.message}`));

await page.goto("http://localhost:4300/");
await page.getByRole("button", { name: /phones from dubai/i }).click();
await page.getByRole("heading", { name: /your estimated landed cost/i }).waitFor({ timeout: 30000 });
await page.goto("http://localhost:4300/how-it-works");
await page.getByRole("heading", { name: /how the estimate is worked out/i }).waitFor();
await page.waitForTimeout(1500);
await page.goto("http://localhost:4300/admin");
await page.getByRole("heading", { name: "Sign in" }).waitFor();

const sent = await page.evaluate(async () => (await fetch("/")).headers.get("content-security-policy"));
await browser.close();
server.close();

console.log("CSP sent:", sent ? "yes" : "NO");
if (violations.length) {
  console.log("CSP violations / errors:\n" + violations.join("\n"));
  process.exit(1);
}
console.log("No CSP violations: calculator, calculation, methodology and admin all load under the production policy.");
