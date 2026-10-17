import type { CalcRequest, CalcResponse } from "@/lib/api/schemas";
import { formatNgn, formatRate } from "@/lib/format";

export function summaryText(res: CalcResponse, req: CalcRequest, url: string) {
  const t = res.totals;
  const goods = res.items.map((it) => `${it.quantity} × ${it.description} (HS ${it.hs_code})`).join(", ");
  return [
    "PortWise estimate",
    goods,
    `Landed cost: ${formatNgn(t.total)}`,
    `Customs value ${formatNgn(t.cif)}, duty ${formatNgn(t.duty)}, levies ${formatNgn(t.levies)}, VAT ${formatNgn(t.vat)}`,
    ...res.fx.map((f) => `Rate: ${formatRate(f.from, f.rate)}`),
    req.items.length === 1 && res.items[0].quantity > 1 ? `Per unit: ${formatNgn(res.items[0].per_unit)}` : null,
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
