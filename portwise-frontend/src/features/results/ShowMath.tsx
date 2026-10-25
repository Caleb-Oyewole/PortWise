import type { FxUsed, LineResult } from "@/lib/api/schemas";
import { formatAmount, formatInt, formatNgn, formatPct } from "@/lib/format";
import { chargeLabel } from "./labels";

/**
 * Step-by-step working for one product line. Every number comes from the API
 * response; the UI only sets them in sentences.
 */
function LineMath({ line, fx }: { line: LineResult; fx: FxUsed[] }) {
  const b = line.breakdown;
  const currency = line.currency ?? "NGN";
  const rate = line.fx_rate ?? fx.find((f) => f.currency === currency)?.rate;
  const steps: { name: string; working: string; result: number }[] = [];

  steps.push({
    name: "Goods value (FOB)",
    working:
      line.fob_value_fc != null && currency !== "NGN" && rate
        ? `${currency} ${formatAmount(line.fob_value_fc)}${line.quantity ? ` for ${formatInt(line.quantity)} units` : ""} at ${formatNgn(rate)} per ${currency}`
        : line.quantity
          ? `${formatInt(line.quantity)} units`
          : "Invoice value",
    result: line.fob_value_ngn,
  });
  for (const c of b.charges) {
    if (c.name === "CIF Value") {
      steps.push({
        name: "Customs value (CIF)",
        working: `${formatNgn(line.fob_value_ngn)} goods + ${formatNgn(line.allocated_freight_insurance_ngn)} freight and insurance`,
        result: c.amount_ngn,
      });
    } else {
      steps.push({ name: chargeLabel(c), working: `${formatNgn(c.base)} × ${formatPct(c.rate_pct)}`, result: c.amount_ngn });
    }
  }
  steps.push({
    name: "VAT",
    working: `${formatNgn(b.vat_base_ngn)} (customs value, duty and levies) × ${formatPct(b.vat_rate_pct)}`,
    result: b.vat_amount_ngn,
  });
  steps.push({
    name: "Landed cost",
    working: `${formatNgn(b.cif_value_ngn)} customs value + ${formatNgn(b.total_charges_ngn)} duty, ${b.iat_amount_ngn ? "IAT, " : ""}levies and VAT`,
    result: b.total_landed_cost_ngn,
  });

  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.name + i} className="grid grid-cols-[1.75rem_1fr] gap-x-2">
          <span
            aria-hidden="true"
            className="mt-px flex size-6 items-center justify-center rounded-full border border-pw-border bg-white text-xs font-semibold text-pw-muted num"
          >
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-pw-text">{s.name}</p>
            <p className="text-sm leading-6 text-pw-muted num">
              {s.working} = <span className="font-semibold text-pw-text">{formatNgn(s.result)}</span>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ShowMath({ lines, fx }: { lines: LineResult[]; fx: FxUsed[] }) {
  if (lines.length === 1) return <LineMath line={lines[0]} fx={fx} />;
  return (
    <div className="space-y-6">
      {lines.map((line, i) => (
        <section key={line.item_id} aria-label={`Working for ${line.description ?? line.hs_code}`}>
          <h4 className="mb-3 text-sm font-semibold text-pw-navy">
            {i + 1}. {line.description ?? `HS ${line.hs_code}`}
          </h4>
          <LineMath line={line} fx={fx} />
        </section>
      ))}
    </div>
  );
}
