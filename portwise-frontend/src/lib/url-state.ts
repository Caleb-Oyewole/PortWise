// Stateless sharing: a successful calculation is written to the URL so a
// shared link restores (and recalculates) exactly the same shipment.
//   ?i=8517.13~250~USD~20~AE   one `i` per product: hs_code~unit_value~currency~quantity~origin
//   &f=250~USD                 freight and insurance (optional)
//   &r=legacy                  levy regime (optional)   &e=0  ETLS off (optional)
import { CalcRequest } from "./api/schemas";

const SEP = "~";
const safe = (v: string | number) => encodeURIComponent(String(v)).replace(/%7E/gi, "~");

/** Built by hand: every part is URL-safe, and "~" stays readable when pasted into WhatsApp. */
export function encodeRequest(req: CalcRequest): string {
  const parts = req.items.map(
    (it) => "i=" + [it.hs_code, it.unit_value, it.currency, it.quantity, it.origin_country].map(safe).join(SEP),
  );
  if (req.total_freight_insurance != null) parts.push(`f=${safe(req.total_freight_insurance)}${SEP}${req.freight_currency ?? "NGN"}`);
  if (req.regime) parts.push(`r=${req.regime}`);
  if (req.etls_applicable === false) parts.push("e=0");
  return parts.join("&");
}

export function decodeRequest(search: string): CalcRequest | null {
  const p = new URLSearchParams(search);
  const raw = p.getAll("i");
  if (raw.length === 0) return null;
  const num = (s: string | undefined) => (s === undefined || s === "" ? NaN : Number(s));
  const items = raw.map((r, i) => {
    const [hs, value, cur, qty, origin] = r.split(SEP);
    return {
      item_id: String(i + 1),
      hs_code: hs,
      unit_value: num(value),
      currency: cur?.toUpperCase(),
      quantity: num(qty || "1"),
      origin_country: (origin || "CN").toUpperCase(),
    };
  });
  const [freight, freightCcy] = (p.get("f") ?? "").split(SEP);
  const regime = p.get("r");
  const parsed = CalcRequest.safeParse({
    items,
    ...(freight ? { total_freight_insurance: Number(freight), freight_currency: (freightCcy || "NGN").toUpperCase() } : {}),
    ...(regime ? { regime } : {}),
    ...(p.get("e") === "0" ? { etls_applicable: false } : {}),
  });
  return parsed.success ? parsed.data : null; // invalid links fall back to an empty form
}

export function writeUrl(req: CalcRequest) {
  const url = `${location.pathname}?${encodeRequest(req)}${location.hash}`;
  if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, "", url);
}

export function shareUrl(req: CalcRequest) {
  return `${location.origin}${location.pathname}?${encodeRequest(req)}`;
}
