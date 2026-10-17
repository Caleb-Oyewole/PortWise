import { formatNgn, formatPct, relativeTime, splitNgn } from "./format";
import { formatMoneyInput, parseInteger, parseMoney, parseWeight } from "./parse";
import { decodeItems, encodeItems } from "./url-state";
import { CalcResponse } from "./api/schemas";
import { apiFieldToFormPath, makeFormSchema, toRequest } from "@/features/calculator/form-model";
import { hsCodes } from "@/mocks/fixtures";

describe("format", () => {
  it("formats naira with the symbol, never NGN", () => {
    expect(formatNgn(10400221.88)).toBe("₦10,400,221.88");
    expect(formatNgn(0)).toBe("₦0.00");
  });
  it("splits whole naira and kobo for the hero", () => {
    expect(splitNgn(1797937.5)).toEqual({ whole: "₦1,797,937", kobo: ".50" });
  });
  it("formats percentages given as percent", () => {
    expect(formatPct(7.5)).toBe("7.5%");
    expect(formatPct(20)).toBe("20%");
    expect(formatPct(0.5)).toBe("0.5%");
  });
  it("describes age in plain words", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    expect(relativeTime("2026-10-05T11:58:00Z", now)).toBe("2 min ago");
    expect(relativeTime("2026-10-05T09:00:00Z", now)).toBe("3 h ago");
  });
});

describe("parse", () => {
  it.each([
    ["1,000.50", 1000.5],
    ["$1000", 1000],
    ["1 000", 1000],
    ["₦2,500", 2500],
    [".5", 0.5],
  ])("parses %s", (raw, n) => expect(parseMoney(raw)).toBe(n));
  it.each(["", ".", "abc", "1.234", "-5", "1e5"])("rejects %s", (raw) => expect(parseMoney(raw)).toBeNull());
  it("parses integers and weights", () => {
    expect(parseInteger("1,500")).toBe(1500);
    expect(parseInteger("1.5")).toBeNull();
    expect(parseWeight("12.5 kg")).toBe(12.5);
  });
  it("formats money input on blur", () => expect(formatMoneyInput("1000.5")).toBe("1,000.50"));
});

describe("url state", () => {
  const req = {
    items: [
      { hs_code_id: 12, unit_value: 250, currency: "USD" as const, quantity: 20, shipping_insurance: 250, weight_kg: null },
      { hs_code_id: 43, unit_value: 12.5, currency: "EUR" as const, quantity: 400, shipping_insurance: null, weight_kg: 3 },
    ],
  };
  it("round-trips several items", () => {
    expect(decodeItems("?" + encodeItems(req.items))).toEqual(req);
  });
  it("ignores broken links", () => {
    expect(decodeItems("?i=abc~~ZZZ")).toBeNull();
    expect(decodeItems("")).toBeNull();
  });
});

describe("form model", () => {
  const byId = new Map(hsCodes.map((h) => [h.id, h]));
  const schema = makeFormSchema(byId);
  const valid = { hsCodeId: 12, unitValue: "250.00", currency: "USD" as const, quantity: "20", shipping: "", weight: "" };

  it("accepts a valid item and builds the request", () => {
    expect(schema.safeParse({ items: [valid] }).success).toBe(true);
    expect(toRequest({ items: [valid] }, byId).items[0]).toEqual({
      hs_code_id: 12,
      unit_value: 250,
      currency: "USD",
      quantity: 20,
      shipping_insurance: null,
      weight_kg: null,
    });
  });
  it("explains each invalid field", () => {
    const r = schema.safeParse({ items: [{ ...valid, hsCodeId: null, unitValue: "0", quantity: "1.5" }] });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toEqual(["Choose a product or HS code.", "Enter an amount greater than 0.", "Quantity must be a whole number, 1 or more."]);
  });
  it("requires weight for per-kg products", () => {
    const perKg = new Map(byId);
    perKg.set(12, { ...byId.get(12)!, rate_type: "per_kg", rate_per_kg: 400 });
    expect(makeFormSchema(perKg).safeParse({ items: [valid] }).success).toBe(false);
  });
  it("maps API field paths onto inputs", () => {
    expect(apiFieldToFormPath("items.0.unit_value")).toBe("items.0.unitValue");
    expect(apiFieldToFormPath("body.items.2.weight_kg")).toBe("items.2.weight");
    expect(apiFieldToFormPath("items")).toBeNull();
  });
});

describe("contract", () => {
  it("parses the Backend document's example response, including decimal strings", () => {
    const body = {
      currency: "NGN",
      fx: [{ from: "USD", rate: 1500.0, fetched_at: "2026-10-05T09:12:00Z", stale: false }],
      items: [
        {
          hs_code: "8517.13",
          description: "Smartphones",
          quantity: 20,
          fob: "7500000.00",
          shipping_insurance: 375000.0,
          cif: 7875000.0,
          duty: { pct: 20, amount: 1575000.0 },
          levies: [
            { code: "SURCHARGE", pct: 7, amount: 110250.0 },
            { code: "ETLS", pct: 0.5, amount: 39375.0 },
            { code: "CISS", pct: 1, amount: 75000.0 },
          ],
          vat: { pct: 7.5, base: 9674625.0, amount: 725596.88 },
          total: 10400221.88,
          per_unit: 520011.09,
        },
      ],
      totals: { fob: 7500000.0, cif: 7875000.0, duty: 1575000.0, levies: 224625.0, vat: 725596.88, total: 10400221.88, uplift_pct: 38.67 },
      disclaimer: "Estimate only. Final charges are set by the Nigeria Customs Service.",
    };
    const parsed = CalcResponse.parse(body);
    expect(parsed.items[0].fob).toBe(7500000);
    expect(parsed.totals.total).toBe(10400221.88);
  });
});
