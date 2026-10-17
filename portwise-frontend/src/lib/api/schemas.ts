// The API contract, modelled on "PortWise — Backend and Database Document" §3.
// Responses are validated here once; the rest of the app trusts these types.
// Change this file only through a PR that tags all four developers.
import { z } from "zod";

export const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "NGN"] as const;
export const Currency = z.enum(CURRENCIES);
export type Currency = z.infer<typeof Currency>;

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CNY: "¥",
  NGN: "₦",
};

export const CURRENCY_NAME: Record<Currency, string> = {
  USD: "US dollar",
  EUR: "Euro",
  GBP: "British pound",
  CNY: "Chinese yuan",
  NGN: "Nigerian naira",
};

export const MAX_ITEMS = 10;
export const MAX_VALUE = 1_000_000_000;
export const MAX_QUANTITY = 1_000_000;

// Money may arrive as a JSON number or a decimal string; convert once, here.
const Money = z.coerce.number();
const Pct = z.coerce.number();

/** Accepts either a bare array or an object wrapping one ({ data: [...] }). */
function listOf<T extends z.ZodTypeAny>(item: T) {
  return z.preprocess((v) => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      const inner = Object.values(v as Record<string, unknown>).find(Array.isArray);
      if (inner) return inner;
    }
    return v;
  }, z.array(item));
}

// ---------- POST /calculate ----------

export const CalcItemRequest = z.object({
  hs_code_id: z.number().int().positive(),
  unit_value: z.number().positive().max(MAX_VALUE),
  currency: Currency,
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  shipping_insurance: z.number().min(0).max(MAX_VALUE).nullable(),
  weight_kg: z.number().positive().max(10_000_000).nullable(),
});
export type CalcItemRequest = z.infer<typeof CalcItemRequest>;

export const CalcRequest = z.object({
  items: z.array(CalcItemRequest).min(1).max(MAX_ITEMS),
});
export type CalcRequest = z.infer<typeof CalcRequest>;

export const FxQuote = z.object({
  from: Currency,
  rate: z.coerce.number().positive(),
  fetched_at: z.string(),
  stale: z.boolean().default(false),
});
export type FxQuote = z.infer<typeof FxQuote>;

export const LevyBase = z.enum(["fob", "cif", "duty"]);
export type LevyBase = z.infer<typeof LevyBase>;

export const LevyLine = z.object({
  code: z.string(),
  name: z.string().optional(),
  pct: Pct,
  base: LevyBase.optional(),
  amount: Money,
});
export type LevyLine = z.infer<typeof LevyLine>;

export const DutyLine = z.object({
  pct: Pct.nullable().optional(),
  amount: Money,
  rate_type: z.enum(["ad_valorem", "per_kg"]).optional(),
  rate_per_kg: Money.nullable().optional(),
});
export type DutyLine = z.infer<typeof DutyLine>;

export const CalcItemResult = z.object({
  hs_code: z.string(),
  description: z.string(),
  quantity: z.number(),
  fob: Money,
  shipping_insurance: Money,
  cif: Money,
  duty: DutyLine,
  levies: z.array(LevyLine),
  vat: z.object({ pct: Pct, base: Money, amount: Money }),
  total: Money,
  per_unit: Money,
  // Optional echoes of the request; the UI falls back to the request when absent.
  hs_code_id: z.number().optional(),
  currency: Currency.optional(),
  unit_value: Money.optional(),
  weight_kg: Money.nullable().optional(),
});
export type CalcItemResult = z.infer<typeof CalcItemResult>;

export const CalcTotals = z.object({
  fob: Money,
  cif: Money,
  duty: Money,
  levies: Money,
  vat: Money,
  total: Money,
  uplift_pct: Pct,
});
export type CalcTotals = z.infer<typeof CalcTotals>;

export const CalcResponse = z.object({
  currency: z.literal("NGN").default("NGN"),
  fx: z.array(FxQuote).default([]),
  items: z.array(CalcItemResult).min(1),
  totals: CalcTotals,
  disclaimer: z.string().optional(),
});
export type CalcResponse = z.infer<typeof CalcResponse>;

// ---------- Read endpoints ----------

export const Category = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  needs_weight: z.boolean().default(false),
  icon: z.string().nullable().optional(),
});
export type Category = z.infer<typeof Category>;
export const CategoriesResponse = listOf(Category);

export const HsCode = z.object({
  id: z.number(),
  code: z.string(),
  description: z.string(),
  category_id: z.number(),
  keywords: z.string().nullable().optional(),
  rate_type: z.enum(["ad_valorem", "per_kg"]).nullable().optional(),
  duty_pct: Pct.nullable().optional(),
  rate_per_kg: Money.nullable().optional(),
  needs_weight: z.boolean().optional(),
  has_rate: z.boolean().optional(),
});
export type HsCode = z.infer<typeof HsCode>;
export const HsCodesResponse = listOf(HsCode);

export const FxResponse = z.object({
  from: Currency,
  rate: z.coerce.number().positive(),
  fetched_at: z.string(),
  stale: z.boolean().default(false),
});
export type FxResponse = z.infer<typeof FxResponse>;

export const Preset = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  items: z.array(CalcItemRequest).min(1),
});
export type Preset = z.infer<typeof Preset>;
export const PresetsResponse = listOf(Preset);

// ---------- Errors ----------

export const ErrorCode = z.enum([
  "VALIDATION_ERROR",
  "HS_CODE_NOT_FOUND",
  "NO_DUTY_RATE",
  "FX_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string().optional(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
