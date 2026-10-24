import type { CalcItemResult, LevyBase, LevyLine } from "@/lib/api/schemas";
import { formatKg, formatNgn, formatPct } from "@/lib/format";

const LEVY_NAMES: Record<string, string> = {
  SURCHARGE: "Customs surcharge",
  ETLS: "ECOWAS trade levy (ETLS)",
  CISS: "Import supervision levy (CISS)",
};
const LEVY_BASES: Record<string, LevyBase> = { SURCHARGE: "duty", ETLS: "cif", CISS: "fob" };

export const levyName = (l: LevyLine) => l.name ?? LEVY_NAMES[l.code] ?? l.code;
export const levyBase = (l: LevyLine): LevyBase | undefined => l.base ?? LEVY_BASES[l.code];

export const BASE_NAME: Record<LevyBase, string> = {
  fob: "goods value",
  cif: "customs value",
  duty: "import duty",
};

export const levyBasis = (l: LevyLine) => {
  const b = levyBase(l);
  return b ? `${formatPct(l.pct)} of ${BASE_NAME[b]}` : formatPct(l.pct);
};

export const dutyBasis = (it: CalcItemResult) =>
  it.duty.rate_type === "per_kg" && it.duty.rate_per_kg != null
    ? `${formatNgn(it.duty.rate_per_kg)} per kg${it.weight_kg ? ` × ${formatKg(it.weight_kg)}` : ""}`
    : `${formatPct(it.duty.pct ?? 0)} of customs value`;

export const baseAmount = (it: CalcItemResult, base: LevyBase | undefined) =>
  base === "fob" ? it.fob : base === "cif" ? it.cif : base === "duty" ? it.duty.amount : undefined;
