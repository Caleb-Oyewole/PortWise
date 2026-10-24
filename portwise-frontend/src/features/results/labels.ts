import type { Breakdown, Charge, LineResult } from "@/lib/api/schemas";
import { formatNgn, formatPct } from "@/lib/format";
import { PART_COLORS } from "./ContainerBar";

/** Plain-language names for the API's charge lines. */
const CHARGE_INFO: Record<string, { label: string; base: string; part: keyof typeof PART_COLORS }> = {
  "CIF Value": { label: "Customs value (CIF)", base: "", part: "cif" },
  "Import Duty": { label: "Import duty", base: "customs value", part: "duty" },
  Surcharge: { label: "Customs surcharge", base: "import duty", part: "levies" },
  CISS: { label: "Import supervision levy (CISS)", base: "goods value", part: "levies" },
  "FOB Charge": { label: "FOB charge", base: "goods value", part: "levies" },
  ETLS: { label: "ECOWAS trade levy (ETLS)", base: "customs value", part: "levies" },
};

export const chargeLabel = (c: Charge) => CHARGE_INFO[c.name]?.label ?? c.name;
export const chargePart = (c: Charge) => CHARGE_INFO[c.name]?.part ?? "levies";
export const chargeColor = (c: Charge) => PART_COLORS[chargePart(c)];

export function chargeBasis(c: Charge, line?: LineResult) {
  if (c.name === "CIF Value") {
    return line
      ? `Goods ${formatNgn(line.fob_value_ngn)} plus freight and insurance ${formatNgn(line.allocated_freight_insurance_ngn)}`
      : "Goods plus freight and insurance";
  }
  const base = CHARGE_INFO[c.name]?.base;
  return base ? `${formatPct(c.rate_pct)} of ${base}` : `${formatPct(c.rate_pct)}`;
}

export const vatBasis = (b: Breakdown) => `${formatPct(b.vat_rate_pct)} of customs value, duty and levies`;

export const levyNames = (b: Breakdown) =>
  b.charges.filter((c) => chargePart(c) === "levies").map((c) => CHARGE_INFO[c.name]?.label ?? c.name);
