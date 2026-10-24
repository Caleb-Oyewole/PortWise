import { REGIME_NAME, type CalcResponse, type Scenario } from "@/lib/api/schemas";
import { formatInt, formatNgn } from "@/lib/format";

export function summaryText(res: CalcResponse, scenario: Scenario, url: string) {
  const s = scenario.shipment_summary;
  const goods = scenario.line_items
    .map((l) => `${l.quantity ? `${formatInt(l.quantity)} × ` : ""}${l.description ?? "goods"} (HS ${l.hs_code})`)
    .join(", ");
  const other = res.scenarios.find((x) => x.regime !== scenario.regime);
  const single = scenario.line_items.length === 1 ? scenario.line_items[0] : undefined;
  return [
    "PortWise estimate",
    goods,
    `Landed cost: ${formatNgn(s.grand_total_landed_cost_ngn)} (${REGIME_NAME[scenario.regime]})`,
    other ? `With the ${REGIME_NAME[other.regime]}: ${formatNgn(other.shipment_summary.grand_total_landed_cost_ngn)}` : null,
    single?.per_unit_landed_cost_ngn ? `Per unit: ${formatNgn(single.per_unit_landed_cost_ngn)}` : null,
    `Customs value ${formatNgn(s.total_cif_ngn)}, duty ${formatNgn(s.total_duty_ngn)}, levies ${formatNgn(s.total_levies_ngn)}, VAT ${formatNgn(s.total_vat_ngn)}`,
    ...res.fx.filter((f) => f.currency !== "NGN").map((f) => `Rate: 1 ${f.currency} = ${formatNgn(f.rate)}`),
    "Estimate only, not an official customs assessment.",
    url,
  ]
    .filter(Boolean)
    .join("\n");
}

export const whatsappHref = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older WebViews without the async clipboard.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}
