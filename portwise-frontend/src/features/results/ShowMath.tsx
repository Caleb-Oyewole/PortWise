import type { CalcItemRequest, CalcItemResult, CalcResponse } from "@/lib/api/schemas";
import { formatForeign, formatInt, formatNgn, formatPct } from "@/lib/format";
import { baseAmount, BASE_NAME, levyBase, levyName } from "./labels";

/**
 * Step-by-step working for one product. Every number comes from the API
 * response (or the request the user typed); the UI only sets them in sentences.
 */
function ItemMath({ item, req, fx }: { item: CalcItemResult; req: CalcItemRequest | undefined; fx: CalcResponse["fx"] }) {
  const currency = item.currency ?? req?.currency ?? "NGN";
  const unit = item.unit_value ?? req?.unit_value;
  const rate = fx.find((f) => f.from === currency)?.rate;
  const steps: { name: string; working: string; result: number }[] = [];

  steps.push({
    name: "Goods value (FOB)",
    working:
      unit != null
        ? `${formatForeign(currency, unit)} × ${formatInt(item.quantity)}${currency !== "NGN" && rate ? ` at ${formatNgn(rate)} per ${currency}` : ""}`
        : `${formatInt(item.quantity)} units`,
    result: item.fob,
  });
  steps.push({
    name: "Customs value (CIF)",
    working: `${formatNgn(item.fob)} goods + ${formatNgn(item.shipping_insurance)} shipping and insurance`,
    result: item.cif,
  });
  steps.push({
    name: "Import duty",
    working:
      item.duty.rate_type === "per_kg" && item.duty.rate_per_kg != null
        ? `${item.weight_kg ?? req?.weight_kg ?? "?"} kg × ${formatNgn(item.duty.rate_per_kg)} per kg`
        : `${formatNgn(item.cif)} × ${formatPct(item.duty.pct ?? 0)}`,
    result: item.duty.amount,
  });
  for (const l of item.levies) {
    const b = levyBase(l);
    const amt = baseAmount(item, b);
    steps.push({
      name: levyName(l),
      working: amt != null && b ? `${formatNgn(amt)} ${BASE_NAME[b]} × ${formatPct(l.pct)}` : formatPct(l.pct),
      result: l.amount,
    });
  }
  steps.push({
    name: "VAT",
    working: `${formatNgn(item.vat.base)} (customs value, duty and levies) × ${formatPct(item.vat.pct)}`,
    result: item.vat.amount,
  });
  steps.push({
    name: "Landed cost",
    working: `${formatNgn(item.vat.base)} + ${formatNgn(item.vat.amount)} VAT`,
    result: item.total,
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

export function ShowMath({ res, reqItems }: { res: CalcResponse; reqItems: CalcItemRequest[] }) {
  if (res.items.length === 1) return <ItemMath item={res.items[0]} req={reqItems[0]} fx={res.fx} />;
  return (
    <div className="space-y-6">
      {res.items.map((it, i) => (
        <section key={i} aria-label={`Working for ${it.description}`}>
          <h4 className="mb-3 text-sm font-semibold text-pw-navy">
            {i + 1}. {it.description}
          </h4>
          <ItemMath item={it} req={reqItems[i]} fx={res.fx} />
        </section>
      ))}
    </div>
  );
}
