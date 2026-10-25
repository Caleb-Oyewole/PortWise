// The API contract: PortWise API v2 (portwise-backend, see its README and /docs).
// Responses are validated here once; the rest of the app trusts these types.
import { z } from "zod";

export const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "AED", "NGN"] as const;
export const Currency = z.enum(CURRENCIES);
export type Currency = z.infer<typeof Currency>;

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CNY: "¥",
  AED: "د.إ",
  NGN: "₦",
};

export const CURRENCY_NAME: Record<Currency, string> = {
  USD: "US dollar",
  EUR: "Euro",
  GBP: "British pound",
  CNY: "Chinese yuan",
  AED: "UAE dirham",
  NGN: "Nigerian naira",
};

/** Origins importers ship from most; ECOWAS members change the rules on prohibited goods and ETLS. */
export const ORIGINS = [
  { code: "CN", name: "China" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "IN", name: "India" },
  { code: "TR", name: "Turkey" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "IT", name: "Italy" },
  { code: "GH", name: "Ghana (ECOWAS)" },
  { code: "BJ", name: "Benin (ECOWAS)" },
  { code: "CI", name: "Côte d'Ivoire (ECOWAS)" },
  { code: "TG", name: "Togo (ECOWAS)" },
] as const;

export const MAX_ITEMS = 10;
export const MAX_VALUE = 1_000_000_000;
export const MAX_QUANTITY = 10_000_000;

export type Regime = "legacy" | "fob4";
export type RegimeChoice = Regime | "both";

export const REGIME_NAME: Record<Regime, string> = {
  legacy: "1% CISS",
  fob4: "4% FOB charge",
};

const Money = z.coerce.number();

// ---------- POST /api/v1/calculate/multi ----------

export const LineItemRequest = z.object({
  item_id: z.string().min(1),
  hs_code: z.string().min(1),
  unit_value: z.number().positive().max(MAX_VALUE),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  currency: Currency,
  origin_country: z.string().min(2),
});
export type LineItemRequest = z.infer<typeof LineItemRequest>;

export const CalcRequest = z.object({
  items: z.array(LineItemRequest).min(1).max(MAX_ITEMS),
  total_freight_insurance: z.number().min(0).max(MAX_VALUE).optional(),
  freight_currency: Currency.optional(),
  regime: z.enum(["legacy", "fob4", "both"]).optional(),
  etls_applicable: z.boolean().optional(),
});
export type CalcRequest = z.infer<typeof CalcRequest>;

export const Charge = z.object({
  name: z.string(),
  base: Money,
  rate_pct: Money,
  amount_ngn: Money,
});
export type Charge = z.infer<typeof Charge>;

export const Breakdown = z.object({
  regime: z.enum(["legacy", "fob4"]),
  cif_value_ngn: Money,
  duty_amount_ngn: Money,
  iat_amount_ngn: Money.optional(),
  total_levies_ngn: Money,
  vat_base_ngn: Money,
  vat_rate_pct: Money,
  vat_amount_ngn: Money,
  total_charges_ngn: Money,
  total_landed_cost_ngn: Money,
  charges: z.array(Charge),
});
export type Breakdown = z.infer<typeof Breakdown>;

export const LineResult = z.object({
  item_id: z.string(),
  hs_code: z.string(),
  description: z.string().optional(),
  category: z.string().nullable().optional(),
  duty_rate_pct: Money.optional(),
  origin_country: z.string().optional(),
  currency: z.string().optional(),
  fob_value_fc: Money.optional(),
  fx_rate: Money.optional(),
  quantity: z.number().nullable().optional(),
  per_unit_landed_cost_ngn: Money.nullable().optional(),
  fob_value_ngn: Money,
  allocated_freight_insurance_ngn: Money,
  rate_version: z.string().optional(),
  breakdown: Breakdown,
});
export type LineResult = z.infer<typeof LineResult>;

export const ShipmentSummary = z.object({
  total_fob_ngn: Money,
  total_freight_insurance_ngn: Money,
  total_cif_ngn: Money,
  total_duty_ngn: Money,
  total_iat_ngn: Money.optional(),
  total_levies_ngn: Money,
  total_vat_ngn: Money,
  grand_total_landed_cost_ngn: Money,
  total_charges_ngn: Money.optional(),
  charges_pct_of_fob: Money.optional(),
});
export type ShipmentSummary = z.infer<typeof ShipmentSummary>;

export const FxUsed = z.object({
  currency: z.string(),
  rate: Money,
  source: z.string().optional(),
  as_of_date: z.string().optional(),
  stale: z.boolean().default(false),
});
export type FxUsed = z.infer<typeof FxUsed>;

export const Scenario = z.object({
  regime: z.enum(["legacy", "fob4"]),
  shipment_summary: ShipmentSummary,
  line_items: z.array(LineResult),
});
export type Scenario = z.infer<typeof Scenario>;

export const SensitivityRow = z.object({
  fx_shift_pct: z.number(),
  total_landed_cost_ngn: Money,
  exchange_rate: Money.optional(),
});
export type SensitivityRow = z.infer<typeof SensitivityRow>;

export const CalcResponse = z.object({
  success: z.literal(true).optional(),
  regime: z.enum(["legacy", "fob4", "both"]),
  primary_regime: z.enum(["legacy", "fob4"]),
  rate_versions: z.array(z.string()).default([]),
  fx: z.array(FxUsed).default([]),
  warnings: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  item_count: z.number().optional(),
  shipment_summary: ShipmentSummary,
  line_items: z.array(LineResult).min(1),
  scenarios: z.array(Scenario).min(1),
  sensitivity_analysis: z.array(SensitivityRow).default([]),
});
export type CalcResponse = z.infer<typeof CalcResponse>;

// ---------- Read endpoints ----------

export const HsCode = z.object({
  code: z.string(),
  description: z.string(),
  category: z.string(),
  keywords: z.string().nullable().optional(),
  duty_rate_pct: Money,
  iat_rate_pct: Money.default(0),
  prohibited: z.boolean().default(false),
  source_ref: z.string().nullable().optional(),
  hs_version: z.string().optional(),
  effective_from: z.string().optional(),
});
export type HsCode = z.infer<typeof HsCode>;

export const HsCodesResponse = z.object({
  count: z.number(),
  categories: z.array(z.object({ name: z.string(), count: z.number() })),
  items: z.array(HsCode),
  tariff_updated_at: z.string().nullable().optional(),
});
export type HsCodesResponse = z.infer<typeof HsCodesResponse>;

export const FxRate = z.object({
  currency: z.string(),
  rate: Money,
  source: z.string(),
  as_of_date: z.string(),
  stale: z.boolean().default(false),
  placeholder: z.boolean().default(false),
  is_manual: z.boolean().default(false),
  age_business_days: z.number().default(0),
});
export type FxRate = z.infer<typeof FxRate>;

export const FxListResponse = z.object({
  base: z.string(),
  stale_after_business_days: z.number(),
  rates: z.array(FxRate),
});
export type FxListResponse = z.infer<typeof FxListResponse>;

export const Preset = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  freight: z.object({ amount: z.number(), currency: Currency }).optional(),
  items: z
    .array(
      z.object({
        hs_code: z.string(),
        unit_value: z.number(),
        quantity: z.number(),
        currency: Currency,
        origin_country: z.string(),
      }),
    )
    .min(1),
});
export type Preset = z.infer<typeof Preset>;
export const PresetsResponse = z.array(Preset);

export const RegimeConfig = z.object({
  active_regime: z.enum(["legacy", "fob4", "both"]),
  rates: z.object({
    surcharge_pct: z.number(),
    ciss_pct: z.number(),
    fob_charge_pct: z.number(),
    etls_pct: z.number(),
    vat_pct: z.number(),
    default_freight_insurance_pct: z.number(),
  }),
});
export type RegimeConfig = z.infer<typeof RegimeConfig>;

// ---------- Errors ----------

/** Business-rule errors: HTTP 400 { success: false, code, detail }. */
export const RuleError = z.object({ success: z.literal(false).optional(), code: z.string(), detail: z.string() });

/** FastAPI validation errors: HTTP 422 { detail: [{ loc, msg }] }. */
export const ValidationError = z.object({
  detail: z.array(z.object({ loc: z.array(z.union([z.string(), z.number()])), msg: z.string() })),
});
