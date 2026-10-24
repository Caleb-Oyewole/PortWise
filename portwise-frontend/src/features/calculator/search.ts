import type { HsCode } from "@/lib/api/schemas";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.\s]/g, " ");

const digits = (s: string) => s.replace(/\D/g, "");

export interface Match {
  hs: HsCode;
  score: number;
}

/**
 * Client-side product search over the cached list (small dataset, zero latency).
 * Matches description, keywords and category name, plus HS-code prefixes:
 * "8517", "8517.13" and "phone" all find smartphones.
 */
export function searchProducts(query: string, codes: HsCode[]): Match[] {
  const q = norm(query).trim();
  if (!q) return codes.map((hs) => ({ hs, score: 0 }));
  const tokens = q.split(/\s+/).filter(Boolean);
  const qDigits = digits(q);
  const out: Match[] = [];

  for (const hs of codes) {
    const desc = norm(hs.description);
    const hay = `${desc} ${norm(hs.keywords ?? "")} ${norm(hs.category)}`;
    let score = 0;

    if (qDigits.length >= 2 && /^[\d.\s]+$/.test(q)) {
      if (digits(hs.code).startsWith(qDigits)) score = 100 - (digits(hs.code).length - qDigits.length);
      else continue;
    } else {
      // Every token must appear somewhere; prefix matches on words rank higher.
      let ok = true;
      for (const t of tokens) {
        const idx = hay.indexOf(t);
        if (idx === -1) {
          ok = false;
          break;
        }
        const wordStart = idx === 0 || hay[idx - 1] === " ";
        score += (desc.includes(t) ? 10 : 4) + (wordStart ? 5 : 0);
      }
      if (!ok) continue;
      if (desc.startsWith(tokens[0])) score += 8;
    }
    out.push({ hs, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Splits text into [before, match, after] chunks for the first token found. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const tokens = norm(query).trim().split(/\s+/).filter((t) => t.length > 1 && !/^\d/.test(t));
  const lower = text.toLowerCase();
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1) {
      return [
        { text: text.slice(0, i), hit: false },
        { text: text.slice(i, i + t.length), hit: true },
        { text: text.slice(i + t.length), hit: false },
      ].filter((c) => c.text);
    }
  }
  return [{ text, hit: false }];
}
