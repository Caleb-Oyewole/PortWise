import { formatNgn, formatPct, relativeTime, splitNgn } from "./format";
import { formatMoneyInput, parseInteger, parseMoney, parseWeight } from "./parse";
import { decodeRequest, encodeRequest } from "./url-state";
import { CalcResponse } from "./api/schemas";
import {
  apiFieldToFormPath,
  emptyForm,
  fromRequest,
  itemIndexFromMessage,
  makeFormSchema,
  toRequest,
} from "@/features/calculator/form-model";
import { hsCodes } from "@/mocks/fixtures";
import realResponse from "@/test/fixtures/calculate-multi.json";

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
      { item_id: "1", hs_code: "8517.13", unit_value: 250, currency: "USD" as const, quantity: 20, origin_country: "AE" },
      { item_id: "2", hs_code: "8482.10", unit_value: 12.5, currency: "EUR" as const, quantity: 400, origin_country: "DE" },
    ],
    total_freight_insurance: 250,
    freight_currency: "USD" as const,
    regime: "legacy" as const,
  };
  it("round-trips a shipment, freight and regime", () => {
    expect(decodeRequest("?" + encodeRequest(req))).toEqual(req);
  });
  it("keeps links readable", () => {
    expect(encodeRequest(req)).toContain("i=8517.13~250~USD~20~AE");
  });
  it("ignores broken links", () => {
    expect(decodeRequest("?i=abc~~ZZZ")).toBeNull();
    expect(decodeRequest("")).toBeNull();
  });
});

describe("form model", () => {
  const byCode = new Map(hsCodes.map((h) => [h.code, h]));
  const schema = makeFormSchema(byCode);
  const valid = { ...emptyForm(), items: [{ hsCode: "8517.13", unitValue: "250.00", currency: "USD" as const, quantity: "20", origin: "AE" }] };

  it("accepts a valid shipment and builds the request", () => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(toRequest(valid)).toEqual({
      items: [{ item_id: "1", hs_code: "8517.13", unit_value: 250, quantity: 20, currency: "USD", origin_country: "AE" }],
    });
  });
  it("sends freight, regime and ETLS only when set", () => {
    const req = toRequest({ ...valid, freight: "1,200", freightCurrency: "EUR", regime: "fob4", etls: false });
    expect(req).toMatchObject({ total_freight_insurance: 1200, freight_currency: "EUR", regime: "fob4", etls_applicable: false });
    expect(fromRequest(req).freight).toBe("1,200.00");
  });
  it("explains each invalid field", () => {
    const r = schema.safeParse({ ...valid, items: [{ ...valid.items[0], hsCode: null, unitValue: "0", quantity: "1.5" }] });
    expect(r.success).toBe(false);
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toEqual(["Choose a product or HS code.", "Enter an amount greater than 0.", "Quantity must be a whole number, 1 or more."]);
  });
  it("rejects a code that is no longer in the catalog", () => {
    expect(schema.safeParse({ ...valid, items: [{ ...valid.items[0], hsCode: "0000.00" }] }).success).toBe(false);
  });
  it("maps API field paths and item messages onto inputs", () => {
    expect(apiFieldToFormPath("items.0.unit_value")).toBe("items.0.unitValue");
    expect(apiFieldToFormPath("items.2.origin_country")).toBe("items.2.origin");
    expect(apiFieldToFormPath("total_freight_insurance")).toBe("freight");
    expect(apiFieldToFormPath("items")).toBeNull();
    expect(itemIndexFromMessage("Item 2: HS code 9999 is not in the tariff data")).toBe(1);
  });
});

describe("contract", () => {
  it("parses a real /api/v1/calculate/multi response from the backend", () => {
    const parsed = CalcResponse.parse(realResponse);
    expect(parsed.scenarios.map((s) => s.regime)).toEqual(["legacy", "fob4"]);
    expect(parsed.primary_regime).toBe("fob4");
    expect(parsed.line_items[0].breakdown.charges[0].name).toBe("CIF Value");
    expect(parsed.line_items[0].per_unit_landed_cost_ngn).toBeGreaterThan(0);
    const s = parsed.shipment_summary;
    expect(s.total_cif_ngn + s.total_duty_ngn + s.total_levies_ngn + s.total_vat_ngn).toBeCloseTo(s.grand_total_landed_cost_ngn, 1);
  });
});
