// A TypeScript mirror of portwise-backend/app/calculator.py and service.py, used ONLY by the
// mock API (dev and ?demo=1). The production app never computes money: the server does.
//   CIF = FOB + freight;  Duty = CIF x duty%
//   surcharge 7% of duty in both regimes; legacy adds CISS 1% of FOB, fob4 adds 4% of FOB
//   IAT (some codes): % of CIF, added to the total but outside the VAT base
//   ETLS 0.5% of CIF;  VAT 7.5% of CIF + duty + levies;  every charge rounded to the kobo.
import type { Breakdown, CalcResponse, LineResult, Regime, ShipmentSummary } from "@/lib/api/schemas";

/** Half-up to 2 dp, after trimming binary float noise. */
export const q = (x: number) => {
  const clean = Number(x.toPrecision(15));
  return (Math.sign(clean) * Math.round(Math.abs(clean) * 100)) / 100;
};

export interface Rates {
  surcharge_pct: number;
  ciss_pct: number;
  fob_charge_pct: number;
  etls_pct: number;
  vat_pct: number;
  default_freight_insurance_pct: number;
}

export const DEFAULT_RATES: Rates = {
  surcharge_pct: 7,
  ciss_pct: 1,
  fob_charge_pct: 4,
  etls_pct: 0.5,
  vat_pct: 7.5,
  default_freight_insurance_pct: 10,
};

export function computeBreakdown(fob: number, freight: number, dutyPct: number, regime: Regime, etls: boolean, r: Rates, iatPct = 0): Breakdown {
  fob = q(fob);
  freight = q(freight);
  const cif = q(fob + freight);
  const duty = q((cif * dutyPct) / 100);
  const charges = [
    { name: "CIF Value", base: cif, rate_pct: 0, amount_ngn: cif },
    { name: "Import Duty", base: cif, rate_pct: dutyPct, amount_ngn: duty },
  ];
  const iat = q((cif * iatPct) / 100);
  if (iatPct > 0) charges.push({ name: "IAT", base: cif, rate_pct: iatPct, amount_ngn: iat });
  const surcharge = q((duty * r.surcharge_pct) / 100);
  charges.push({ name: "Surcharge", base: duty, rate_pct: r.surcharge_pct, amount_ngn: surcharge });
  let levies = surcharge;
  if (regime === "legacy") {
    const ciss = q((fob * r.ciss_pct) / 100);
    charges.push({ name: "CISS", base: fob, rate_pct: r.ciss_pct, amount_ngn: ciss });
    levies = q(levies + ciss);
  } else {
    const fobCharge = q((fob * r.fob_charge_pct) / 100);
    charges.push({ name: "FOB Charge", base: fob, rate_pct: r.fob_charge_pct, amount_ngn: fobCharge });
    levies = q(levies + fobCharge);
  }
  if (etls) {
    const e = q((cif * r.etls_pct) / 100);
    charges.push({ name: "ETLS", base: cif, rate_pct: r.etls_pct, amount_ngn: e });
    levies = q(levies + e);
  }
  const vatBase = q(cif + duty + levies);
  const vat = q((vatBase * r.vat_pct) / 100);
  const totalCharges = q(duty + iat + levies + vat);
  return {
    regime,
    cif_value_ngn: cif,
    duty_amount_ngn: duty,
    iat_amount_ngn: iat,
    total_levies_ngn: levies,
    vat_base_ngn: vatBase,
    vat_rate_pct: r.vat_pct,
    vat_amount_ngn: vat,
    total_charges_ngn: totalCharges,
    total_landed_cost_ngn: q(cif + totalCharges),
    charges,
  };
}

/** Split a total across weights in kobo; the last line takes the remainder. */
export function allocate(total: number, weights: number[]): number[] {
  total = q(total);
  const sum = weights.reduce((a, b) => a + b, 0) || weights.length;
  const w = weights.reduce((a, b) => a + b, 0) ? weights : weights.map(() => 1);
  const shares = w.slice(0, -1).map((x) => q((total * x) / sum));
  shares.push(Math.max(q(total - shares.reduce((a, b) => a + b, 0)), 0));
  return shares;
}

export interface EngineLine {
  item_id: string;
  hs_code: string;
  description: string;
  category: string;
  duty_pct: number;
  iat_pct?: number;
  fob_fc: number;
  currency: string;
  fx: number;
  origin: string;
  quantity?: number;
}

function evaluate(lines: EngineLine[], freight: number, regime: Regime, etls: boolean, r: Rates, shift = 0) {
  const factor = 1 + shift / 100;
  const fobs = lines.map((l) => q(l.fob_fc * l.fx * factor));
  const shares = allocate(freight, fobs);
  const out: LineResult[] = lines.map((l, i) => {
    const b = computeBreakdown(fobs[i], shares[i], l.duty_pct, regime, etls, r, l.iat_pct ?? 0);
    return {
      item_id: l.item_id,
      hs_code: l.hs_code,
      description: l.description,
      category: l.category,
      duty_rate_pct: l.duty_pct,
      origin_country: l.origin,
      currency: l.currency,
      fob_value_fc: l.fob_fc,
      fx_rate: l.fx,
      quantity: l.quantity ?? null,
      per_unit_landed_cost_ngn: l.quantity ? q(b.total_landed_cost_ngn / l.quantity) : null,
      fob_value_ngn: fobs[i],
      allocated_freight_insurance_ngn: shares[i],
      rate_version: "demo",
      breakdown: b,
    };
  });
  const sum = (f: (x: LineResult) => number) => q(out.reduce((a, x) => a + f(x), 0));
  const totalFob = q(fobs.reduce((a, b) => a + b, 0));
  const grand = sum((x) => x.breakdown.total_landed_cost_ngn);
  const summary: ShipmentSummary = {
    total_fob_ngn: totalFob,
    total_freight_insurance_ngn: q(shares.reduce((a, b) => a + b, 0)),
    total_cif_ngn: sum((x) => x.breakdown.cif_value_ngn),
    total_duty_ngn: sum((x) => x.breakdown.duty_amount_ngn),
    total_iat_ngn: sum((x) => x.breakdown.iat_amount_ngn ?? 0),
    total_levies_ngn: sum((x) => x.breakdown.total_levies_ngn),
    total_vat_ngn: sum((x) => x.breakdown.vat_amount_ngn),
    grand_total_landed_cost_ngn: grand,
    total_charges_ngn: sum((x) => x.breakdown.total_charges_ngn),
    charges_pct_of_fob: totalFob ? q(((grand - totalFob) / totalFob) * 100) : 0,
  };
  return { line_items: out, shipment_summary: summary };
}

export function calculateShipment(opts: {
  lines: EngineLine[];
  freightNgn: number | null;
  regimes: Regime[];
  etls: boolean;
  rates?: Rates;
  fx: CalcResponse["fx"];
  warnings?: string[];
  assumptions?: string[];
}): CalcResponse {
  const r = opts.rates ?? DEFAULT_RATES;
  const baseFob = q(opts.lines.reduce((a, l) => a + q(l.fob_fc * l.fx), 0));
  const assumptions = [...(opts.assumptions ?? [])];
  let freight = opts.freightNgn;
  if (freight == null) {
    freight = q((baseFob * r.default_freight_insurance_pct) / 100);
    assumptions.push(
      `Freight and insurance were not provided, so ${r.default_freight_insurance_pct}% of the FOB value is assumed. Enter the real amount for a firmer estimate.`,
    );
  }
  const results = Object.fromEntries(opts.regimes.map((g) => [g, evaluate(opts.lines, freight!, g, opts.etls, r)])) as Record<
    Regime,
    ReturnType<typeof evaluate>
  >;
  const primary = opts.regimes.reduce((best, g) =>
    results[g].shipment_summary.grand_total_landed_cost_ngn > results[best].shipment_summary.grand_total_landed_cost_ngn ? g : best,
  );
  if (opts.regimes.length > 1) {
    assumptions.unshift("Both levy regimes are shown because the status of the 4% FOB charge is unclear. The headline figure is the higher of the two.");
  }
  if (opts.etls) assumptions.push(`ETLS (${r.etls_pct}% of CIF) is included.`);
  assumptions.push("Estimate only. The HS classification must be confirmed with a licensed customs agent.");
  return {
    success: true,
    regime: opts.regimes.length > 1 ? "both" : opts.regimes[0],
    primary_regime: primary,
    rate_versions: ["demo"],
    fx: opts.fx,
    warnings: opts.warnings ?? [],
    assumptions,
    item_count: opts.lines.length,
    ...results[primary],
    scenarios: opts.regimes.map((g) => ({ regime: g, ...results[g] })),
    sensitivity_analysis: [-5, 0, 5, 10].map((shift) => ({
      fx_shift_pct: shift,
      total_landed_cost_ngn: evaluate(opts.lines, freight!, primary, opts.etls, r, shift).shipment_summary.grand_total_landed_cost_ngn,
      ...(opts.lines.length === 1 ? { exchange_rate: q(opts.lines[0].fx * (1 + shift / 100)) } : {}),
    })),
  };
}
