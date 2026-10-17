import { CURRENCY_SYMBOL, type Currency } from "./api/schemas";

const ngn = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Some WebViews print "NGN 1,000.00"; normalise to the symbol so ₦ and NGN never mix.
export const formatNgn = (n: number) => ngn.format(n).replace(/NGN\s?/, "₦");

/** Hero display: "₦1,797,937" + ".50". Same value as the table, only split. */
export function splitNgn(n: number) {
  const s = formatNgn(n);
  const i = s.lastIndexOf(".");
  return i === -1 ? { whole: s, kobo: "" } : { whole: s.slice(0, i), kobo: s.slice(i) };
}

const plain = new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "USD 1,250.00" — invoice-currency amounts carry the code, not a symbol. */
export const formatForeign = (currency: Currency, n: number) =>
  currency === "NGN" ? formatNgn(n) : `${currency} ${plain.format(n)}`;

export const formatAmount = (n: number) => plain.format(n);

/** Percent values arrive as percentages (7.5 means 7.5%). */
export const formatPct = (pct: number) => `${Number(pct.toFixed(3))}%`;

export const formatRate = (currency: Currency, rate: number) => `1 ${currency} = ${formatNgn(rate)}`;

export const currencySymbol = (c: Currency) => CURRENCY_SYMBOL[c];

const int = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });
export const formatInt = (n: number) => int.format(n);

const kg = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 });
export const formatKg = (n: number) => `${kg.format(n)} kg`;

/** "just now", "4 min ago", "3 h ago", "2 days ago". */
export function relativeTime(iso: string, now = Date.now()) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const time = new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false });
const date = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" });

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDate = (iso: string | Date) => date.format(typeof iso === "string" ? new Date(iso) : iso);
