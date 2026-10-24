// Stateless sharing: a successful calculation is written to the URL so a
// shared link restores (and recalculates) exactly the same goods.
//   ?i=12~250~USD~20~250~   one `i` per item: hs_code_id~unit_value~currency~quantity~shipping~weight
import { CalcRequest, type CalcItemRequest } from "./api/schemas";

const SEP = "~";

/** "i=12~250~USD~20~250~&i=…". Built by hand: every part is URL-safe, and "~" stays readable when pasted. */
export function encodeItems(items: CalcItemRequest[]): string {
  return items
    .map((it) =>
      "i=" +
      [it.hs_code_id, it.unit_value, it.currency, it.quantity, it.shipping_insurance ?? "", it.weight_kg ?? ""]
        .map((v) => encodeURIComponent(String(v)).replace(/%7E/gi, "~"))
        .join(SEP),
    )
    .join("&");
}

export function decodeItems(search: string): CalcRequest | null {
  const p = new URLSearchParams(search);
  const raw = p.getAll("i");
  if (raw.length === 0) return null;
  const num = (s: string | undefined) => (s === undefined || s === "" ? null : Number(s));
  const items = raw.map((r) => {
    const [hs, value, cur, qty, ship, weight] = r.split(SEP);
    return {
      hs_code_id: num(hs),
      unit_value: num(value),
      currency: cur?.toUpperCase(),
      quantity: num(qty) ?? 1,
      shipping_insurance: num(ship),
      weight_kg: num(weight),
    };
  });
  const parsed = CalcRequest.safeParse({ items });
  return parsed.success ? parsed.data : null; // invalid links fall back to an empty form
}

export function writeUrl(req: CalcRequest) {
  const qs = encodeItems(req.items);
  const url = `${location.pathname}?${qs}${location.hash}`;
  if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, "", url);
}

export function clearUrl() {
  if (location.search) history.replaceState(history.state, "", location.pathname + location.hash);
}

export function shareUrl(req: CalcRequest) {
  return `${location.origin}${location.pathname}?${encodeItems(req.items)}`;
}
