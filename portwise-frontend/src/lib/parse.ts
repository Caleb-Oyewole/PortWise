/**
 * Parses what people paste or type into a money field:
 * "1,000.50", "$1000", "1 000", "₦2,500". Returns null when it is not a
 * non-negative amount with at most two decimals.
 */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[,\s₦$€£¥]/g, "");
  if (cleaned === "" || cleaned === ".") return null;
  if (!/^\d*\.?\d{0,2}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Whole numbers only, commas and spaces allowed. */
export function parseInteger(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}

/** Up to three decimals (grams). */
export function parseWeight(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]|kg$/gi, "");
  if (cleaned === "" || cleaned === ".") return null;
  if (!/^\d*\.?\d{0,3}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Formats a parsed amount back into the field on blur: 1000.5 → "1,000.50". */
export function formatMoneyInput(raw: string): string {
  const n = parseMoney(raw);
  if (n === null) return raw;
  return new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
