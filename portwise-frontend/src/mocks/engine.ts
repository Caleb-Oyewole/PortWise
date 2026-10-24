// Reference implementation of the Backend document §2 formula, used ONLY by
// the mock API. The production app never computes money: the server does.
//   FOB = unit_value × quantity × fx          CIF = FOB + shipping × fx
//   Duty = CIF × duty% (or weight × rate_per_kg)
//   Levies = pct × their base (fob | cif | duty)
//   VAT base = CIF + Duty + Levies             VAT = base × vat%
//   Total = VAT base + VAT
import type { CalcItemResult, CalcResponse, HsCode, LevyBase } from "@/lib/api/schemas";

/** Half-up to 2 dp, after trimming binary float noise. */
export const round2 = (x: number) => {
  const clean = Number(x.toPrecision(15));
  return (Math.sign(clean) * Math.round(Math.abs(clean) * 100)) / 100;
};

export interface EngineItem {
  hs: Pick<HsCode, "code" | "description" | "rate_type" | "duty_pct" | "rate_per_kg"> & { id?: number };
  unitValue: number;
  quantity: number;
  shipping: number;
  weightKg: number | null;
  fx: number;
  currency?: CalcItemResult["currency"];
}

export interface EngineLevy {
  code: string;
  name?: string;
  pct: number;
  base: LevyBase;
}

export function computeItem(item: EngineItem, levies: EngineLevy[], vatPct: number) {
  const fob = item.unitValue * item.quantity * item.fx;
  const ship = item.shipping * item.fx;
  const cif = fob + ship;
  const perKg = item.hs.rate_type === "per_kg";
  const duty = perKg ? (item.weightKg ?? 0) * (item.hs.rate_per_kg ?? 0) : (cif * (item.hs.duty_pct ?? 0)) / 100;
  const bases: Record<LevyBase, number> = { fob, cif, duty };
  const levyLines = levies.map((l) => ({ ...l, raw: (bases[l.base] * l.pct) / 100 }));
  const levySum = levyLines.reduce((s, l) => s + l.raw, 0);
  const vatBase = cif + duty + levySum;
  const vat = (vatBase * vatPct) / 100;
  const total = vatBase + vat;
  return { fob, ship, cif, duty, levyLines, levySum, vatBase, vat, total };
}

export function calculateResponse(
  items: EngineItem[],
  levies: EngineLevy[],
  vatPct: number,
  fx: CalcResponse["fx"],
): CalcResponse {
  const raw = items.map((it) => ({ it, r: computeItem(it, levies, vatPct) }));
  const sum = (f: (r: ReturnType<typeof computeItem>) => number) => raw.reduce((s, x) => s + f(x.r), 0);
  const fob = sum((r) => r.fob);
  const total = sum((r) => r.total);
  return {
    currency: "NGN",
    fx,
    items: raw.map(({ it, r }) => ({
      hs_code_id: it.hs.id,
      hs_code: it.hs.code,
      description: it.hs.description,
      currency: it.currency,
      unit_value: it.unitValue,
      quantity: it.quantity,
      weight_kg: it.weightKg,
      fob: round2(r.fob),
      shipping_insurance: round2(r.ship),
      cif: round2(r.cif),
      duty: {
        pct: it.hs.rate_type === "per_kg" ? null : (it.hs.duty_pct ?? 0),
        amount: round2(r.duty),
        rate_type: it.hs.rate_type ?? "ad_valorem",
        rate_per_kg: it.hs.rate_per_kg ?? null,
      },
      levies: r.levyLines.map((l) => ({ code: l.code, name: l.name, pct: l.pct, base: l.base, amount: round2(l.raw) })),
      vat: { pct: vatPct, base: round2(r.vatBase), amount: round2(r.vat) },
      total: round2(r.total),
      per_unit: round2(r.total / it.quantity),
    })),
    totals: {
      fob: round2(fob),
      cif: round2(sum((r) => r.cif)),
      duty: round2(sum((r) => r.duty)),
      levies: round2(sum((r) => r.levySum)),
      vat: round2(sum((r) => r.vat)),
      total: round2(total),
      uplift_pct: fob > 0 ? round2(((total - fob) / fob) * 100) : 0,
    },
    disclaimer: "Estimate only. Final charges are set by the Nigeria Customs Service.",
  };
}
