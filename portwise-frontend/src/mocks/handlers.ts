import { delay, http, HttpResponse, passthrough } from "msw";
import { CalcRequest, type Currency } from "@/lib/api/schemas";
import { calculateResponse } from "./engine";
import { categories, fxRates, hsCodes, levies, presets, VAT_PCT } from "./fixtures";

// Rehearsal switch: ?mockfail=FX_UNAVAILABLE | INTERNAL_ERROR | NETWORK | SLOW
// (kept for the session) lets us rehearse failure states on demo day.
const failMode = () => {
  try {
    return sessionStorage.getItem("pw-mockfail");
  } catch {
    return null;
  }
};

const fetchedAt = () => new Date(Date.now() - 2 * 60_000).toISOString();

const error = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message, fields } }, { status, headers: { "X-Request-ID": "demo-" + crypto.randomUUID().slice(0, 8) } });

export const handlers = [
  http.get("*/categories", async () => {
    await delay(250);
    return HttpResponse.json(categories);
  }),

  http.get("*/hs-codes", async () => {
    await delay(300);
    return HttpResponse.json(hsCodes);
  }),

  http.get("*/presets", async () => {
    await delay(150);
    return HttpResponse.json(presets);
  }),

  http.get("*/fx", async ({ request }) => {
    await delay(200);
    if (failMode() === "FX_UNAVAILABLE") return error(503, "FX_UNAVAILABLE", "No exchange rate available.");
    const from = (new URL(request.url).searchParams.get("from") ?? "USD").toUpperCase() as Exclude<Currency, "NGN">;
    const rate = fxRates[from];
    if (!rate) return error(422, "VALIDATION_ERROR", "Unsupported currency.", { from: "Unsupported currency." });
    return HttpResponse.json({ from, rate, fetched_at: fetchedAt(), stale: false });
  }),

  http.post("*/calculate", async ({ request }) => {
    const mode = failMode();
    await delay(mode === "SLOW" ? 6000 : 600);
    if (mode === "NETWORK") return HttpResponse.error();
    if (mode === "INTERNAL_ERROR") return error(500, "INTERNAL_ERROR", "Unexpected error.");
    if (mode === "FX_UNAVAILABLE") return error(503, "FX_UNAVAILABLE", "No exchange rate available.");

    const parsed = CalcRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const i of parsed.error.issues) fields[i.path.join(".")] = i.message;
      return error(422, "VALIDATION_ERROR", "Some fields are invalid.", fields);
    }

    const engineItems = [];
    for (const [idx, it] of parsed.data.items.entries()) {
      const hs = hsCodes.find((h) => h.id === it.hs_code_id);
      if (!hs) return error(404, "HS_CODE_NOT_FOUND", "Unknown or inactive HS code.", { [`items.${idx}.hs_code_id`]: "Unknown HS code." });
      if (!hs.has_rate) return error(409, "NO_DUTY_RATE", `No active duty rate for ${hs.code}.`);
      if (hs.rate_type === "per_kg" && !it.weight_kg)
        return error(422, "VALIDATION_ERROR", "Weight is required.", { [`items.${idx}.weight_kg`]: "Weight is required for this product." });
      engineItems.push({
        hs,
        unitValue: it.unit_value,
        quantity: it.quantity,
        shipping: it.shipping_insurance ?? 0,
        weightKg: it.weight_kg,
        fx: it.currency === "NGN" ? 1 : fxRates[it.currency],
        currency: it.currency,
      });
    }

    const used = [...new Set(parsed.data.items.map((i) => i.currency))].filter((c): c is Exclude<Currency, "NGN"> => c !== "NGN");
    const fx = used.map((from) => ({ from, rate: fxRates[from], fetched_at: fetchedAt(), stale: false }));
    return HttpResponse.json(calculateResponse(engineItems, levies, VAT_PCT, fx), {
      headers: { "X-Request-ID": "demo-" + crypto.randomUUID().slice(0, 8) },
    });
  }),

  // Everything else (pages, fonts, scripts) goes to the network untouched.
  http.all("*", () => passthrough()),
];
