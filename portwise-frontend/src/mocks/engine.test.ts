// The demo-mode mock must agree with the real API to the kobo. These are the
// backend team's reference figures (portwise-backend tests/test_api.py).
import { computeBreakdown, calculateShipment, DEFAULT_RATES, allocate, q } from "./engine";

const line = {
  item_id: "1",
  hs_code: "8517.12",
  description: "Phones",
  category: "Phones and electronics",
  duty_pct: 20,
  fob_fc: 3_000_000,
  currency: "NGN",
  fx: 1,
  origin: "CN",
  quantity: 20,
};

describe("landed-cost engine (mirror of the API)", () => {
  it("reference: N3m FOB + N450k freight at 20% duty, legacy regime", () => {
    const b = computeBreakdown(3_000_000, 450_000, 20, "legacy", true, DEFAULT_RATES);
    expect(b.cif_value_ngn).toBe(3_450_000);
    expect(b.duty_amount_ngn).toBe(690_000);
    expect(b.charges.map((c) => [c.name, c.amount_ngn])).toEqual([
      ["CIF Value", 3_450_000],
      ["Import Duty", 690_000],
      ["Surcharge", 48_300],
      ["CISS", 30_000],
      ["ETLS", 17_250],
    ]);
    expect(b.vat_amount_ngn).toBe(317_666.25);
    expect(b.total_landed_cost_ngn).toBe(4_553_216.25);
  });

  it("reference: same goods under the 4% FOB charge (the surcharge still applies)", () => {
    expect(computeBreakdown(3_000_000, 450_000, 20, "fob4", true, DEFAULT_RATES).total_landed_cost_ngn).toBe(4_649_966.25);
  });

  it("IAT is its own line on the customs value, outside the VAT base (NSW phones case)", () => {
    const plain = computeBreakdown(1_361_339.4, 136_133.94, 5, "fob4", true, DEFAULT_RATES);
    const b = computeBreakdown(1_361_339.4, 136_133.94, 5, "fob4", true, DEFAULT_RATES, 5);
    expect(b.charges.find((c) => c.name === "IAT")?.amount_ngn).toBe(74_873.67);
    expect(b.vat_amount_ngn).toBe(plain.vat_amount_ngn);
    expect(b.total_landed_cost_ngn).toBe(q(plain.total_landed_cost_ngn + 74_873.67));
  });

  it("Backend document example #1 (legacy): 20 phones at $250, $250 freight, N1,500/$", () => {
    expect(computeBreakdown(7_500_000, 375_000, 20, "legacy", true, DEFAULT_RATES).total_landed_cost_ngn).toBe(10_400_221.88);
  });

  it("shows both regimes and leads with the higher", () => {
    const res = calculateShipment({ lines: [line], freightNgn: 450_000, regimes: ["legacy", "fob4"], etls: true, fx: [] });
    expect(res.primary_regime).toBe("fob4");
    expect(res.shipment_summary.grand_total_landed_cost_ngn).toBe(4_649_966.25);
    expect(res.scenarios.map((s) => s.shipment_summary.grand_total_landed_cost_ngn)).toEqual([4_553_216.25, 4_649_966.25]);
    expect(res.line_items[0].per_unit_landed_cost_ngn).toBe(232_498.31);
    expect(res.sensitivity_analysis.find((r) => r.fx_shift_pct === 0)?.total_landed_cost_ngn).toBe(4_649_966.25);
  });

  it("assumes freight when none is given and says so", () => {
    const res = calculateShipment({ lines: [line], freightNgn: null, regimes: ["legacy"], etls: true, fx: [] });
    expect(res.shipment_summary.total_freight_insurance_ngn).toBe(300_000);
    expect(res.assumptions.some((a) => a.includes("10% of the FOB value"))).toBe(true);
  });

  it("splits freight in proportion to FOB, remainder to the last line", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([33.33, 33.33, 33.34]);
  });
});
