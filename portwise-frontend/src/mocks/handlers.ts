import { delay, http, HttpResponse, passthrough } from "msw";
import { CalcRequest, type Regime } from "@/lib/api/schemas";
import { calculateShipment, DEFAULT_RATES, q, type EngineLine } from "./engine";
import { fxList, fxRates, hsCodes, presets } from "./fixtures";

// Rehearsal switch: ?mockfail=prohibited_item | unknown_hs_code | INTERNAL_ERROR | NETWORK | SLOW
// (kept for the session) lets us rehearse failure states on demo day.
const failMode = () => {
  try {
    return sessionStorage.getItem("pw-mockfail")?.toLowerCase() ?? null;
  } catch {
    return null;
  }
};

const rule = (code: string, detail: string, status = 400) => HttpResponse.json({ success: false, code, detail }, { status });

const categories = () => {
  const out: { name: string; count: number }[] = [];
  for (const h of hsCodes) {
    if (out.at(-1)?.name === h.category) out.at(-1)!.count += 1;
    else out.push({ name: h.category, count: 1 });
  }
  return out;
};

export const handlers = [
  http.get("*/api/v1/hs-codes", async () => {
    await delay(250);
    return HttpResponse.json({ count: hsCodes.length, categories: categories(), items: hsCodes, tariff_updated_at: "2026-04-01" });
  }),

  http.get("*/api/v1/presets", async () => {
    await delay(150);
    return HttpResponse.json(presets);
  }),

  http.get("*/api/v1/fx", async () => {
    await delay(200);
    return HttpResponse.json({ base: "NGN", stale_after_business_days: 3, rates: fxList() });
  }),

  http.get("*/api/v1/config/regime", async () => {
    await delay(150);
    return HttpResponse.json({ active_regime: "both", rates: DEFAULT_RATES });
  }),

  http.post("*/api/v1/calculate/multi", async ({ request }) => {
    const mode = failMode();
    await delay(mode === "slow" ? 7000 : 600);
    if (mode === "network") return HttpResponse.error();
    if (mode === "internal_error") return HttpResponse.json({ detail: "Internal Server Error" }, { status: 500 });
    if (mode === "prohibited_item")
      return rule("prohibited_item", "Item 1: Prohibited from non-ECOWAS origins under the current import prohibition list.");

    const parsed = CalcRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return HttpResponse.json(
        { detail: parsed.error.issues.map((i) => ({ loc: ["body", ...i.path], msg: i.message, type: "value_error" })) },
        { status: 422 },
      );
    }
    const req = parsed.data;
    const lines: EngineLine[] = [];
    for (const [i, it] of req.items.entries()) {
      const hs = hsCodes.find((h) => h.code.replace(/\./g, "") === it.hs_code.replace(/\./g, ""));
      if (!hs || mode === "unknown_hs_code")
        return rule("unknown_hs_code", `Item ${i + 1}: HS code ${it.hs_code} is not in the tariff data yet, so no estimate can be given.`);
      const fx = it.currency === "NGN" ? 1 : fxRates[it.currency];
      if (!fx) return rule("unsupported_currency", `Item ${i + 1}: No exchange rate is available for ${it.currency}.`);
      lines.push({
        item_id: it.item_id,
        hs_code: hs.code,
        description: hs.description,
        category: hs.category,
        duty_pct: hs.duty_rate_pct,
        iat_pct: hs.iat_rate_pct ?? 0,
        fob_fc: q(it.unit_value * it.quantity),
        currency: it.currency,
        fx,
        origin: it.origin_country,
        quantity: it.quantity,
      });
    }
    const freightCcy = req.freight_currency ?? "NGN";
    const freightNgn =
      req.total_freight_insurance == null ? null : q(req.total_freight_insurance * (freightCcy === "NGN" ? 1 : fxRates[freightCcy]));
    const regimes: Regime[] = req.regime === "legacy" ? ["legacy"] : req.regime === "fob4" ? ["fob4"] : ["legacy", "fob4"];
    const used = [...new Set([...req.items.map((i) => i.currency), freightCcy])].filter((c) => c !== "NGN");
    const warnings = lines
      .map((l) => hsCodes.find((h) => h.code === l.hs_code)!)
      .filter((h) => h.iat_rate_pct > 0)
      .map((h) => `HS ${h.code} has an Import Adjustment Tax of ${h.iat_rate_pct}% on record, but it is not included yet because its calculation basis is unconfirmed. The real cost may be higher.`);
    return HttpResponse.json(
      calculateShipment({
        lines,
        freightNgn,
        regimes,
        etls: req.etls_applicable ?? true,
        fx: used.map((c) => ({ currency: c, rate: fxRates[c], source: "Demo rate", as_of_date: new Date().toISOString().slice(0, 10), stale: false })),
        warnings,
      }),
    );
  }),

  // Everything else (pages, fonts, the admin API) goes to the network untouched.
  http.all("*", () => passthrough()),
];
