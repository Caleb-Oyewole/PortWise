// The Backend document's worked examples (§2). The real API must return the
// same numbers; these tests keep the demo-mode mock honest too.
import { calculateResponse, computeItem, round2 } from "./engine";
import { levies, VAT_PCT } from "./fixtures";

const phones = {
  hs: { code: "8517.13", description: "Smartphones", rate_type: "ad_valorem" as const, duty_pct: 20, rate_per_kg: null },
  unitValue: 250,
  quantity: 20,
  shipping: 250,
  weightKg: null,
  fx: 1500,
};

describe("landed-cost formula", () => {
  it("unit test #1: 20 smartphones × $250 at ₦1,500", () => {
    const res = calculateResponse([phones], levies, VAT_PCT, []);
    const item = res.items[0];
    expect(item.fob).toBe(7_500_000);
    expect(item.shipping_insurance).toBe(375_000);
    expect(item.cif).toBe(7_875_000);
    expect(item.duty.amount).toBe(1_575_000);
    expect(item.levies.map((l) => [l.code, l.amount])).toEqual([
      ["SURCHARGE", 110_250],
      ["ETLS", 39_375],
      ["CISS", 75_000],
    ]);
    expect(item.vat.base).toBe(9_674_625);
    expect(item.vat.amount).toBe(725_596.88);
    expect(item.total).toBe(10_400_221.88);
    expect(item.per_unit).toBe(520_011.09);
    expect(res.totals.levies).toBe(224_625);
    expect(res.totals.uplift_pct).toBe(38.67);
  });

  it("unit test #2: fabric, CIF ₦3,000,000 at 10% duty", () => {
    const r = computeItem(
      {
        hs: { code: "5208.52", description: "Fabric", rate_type: "ad_valorem", duty_pct: 10, rate_per_kg: null },
        unitValue: 3_000_000,
        quantity: 1,
        shipping: 0,
        weightKg: null,
        fx: 1,
      },
      levies,
      VAT_PCT,
    );
    expect(round2(r.total)).toBe(3_618_450);
  });

  it("charges per-kg duty on weight", () => {
    const r = computeItem(
      { ...phones, hs: { ...phones.hs, rate_type: "per_kg", duty_pct: null, rate_per_kg: 400 }, weightKg: 100 },
      levies,
      VAT_PCT,
    );
    expect(r.duty).toBe(40_000);
  });

  it("sums multi-item, multi-currency totals from per-item naira values", () => {
    const res = calculateResponse([phones, { ...phones, fx: 1 }], levies, VAT_PCT, []);
    expect(res.totals.fob).toBe(7_500_000 + 5_000);
    expect(res.totals.total).toBeCloseTo(res.items[0].total + res.items[1].total, 1);
  });
});
