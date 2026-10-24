// What the form holds (strings, as typed) and how it becomes an API request.
import { z } from "zod";
import { CURRENCIES, MAX_QUANTITY, MAX_VALUE, type CalcRequest, type HsCode } from "@/lib/api/schemas";
import { formatMoneyInput, parseInteger, parseMoney } from "@/lib/parse";

export const COPY = {
  product: "Choose a product or HS code.",
  amount: "Enter an amount greater than 0.",
  tooLarge: "That amount is too large for this tool.",
  quantity: "Quantity must be a whole number, 1 or more.",
  freight: "Enter freight and insurance as an amount, or leave it empty.",
} as const;

export const REGIME_CHOICES = ["auto", "both", "legacy", "fob4"] as const;
export type RegimeFormChoice = (typeof REGIME_CHOICES)[number];

export const FormItem = z.object({
  hsCode: z.string().nullable(),
  unitValue: z.string(),
  currency: z.enum(CURRENCIES),
  quantity: z.string(),
  origin: z.string(),
});
export type FormItem = z.infer<typeof FormItem>;

export type FormValues = {
  items: FormItem[];
  freight: string;
  freightCurrency: FormItem["currency"];
  regime: RegimeFormChoice;
  etls: boolean;
};

export const emptyItem = (currency: FormItem["currency"] = "USD", origin = "CN"): FormItem => ({
  hsCode: null,
  unitValue: "",
  currency,
  quantity: "1",
  origin,
});

export const emptyForm = (): FormValues => ({
  items: [emptyItem()],
  freight: "",
  freightCurrency: "USD",
  regime: "auto",
  etls: true,
});

/** Builds the validation schema. Product rules depend on the live catalog. */
export function makeFormSchema(byCode: Map<string, HsCode>) {
  const item = FormItem.superRefine((v, ctx) => {
    if (v.hsCode === null || (byCode.size > 0 && !byCode.has(v.hsCode)))
      ctx.addIssue({ code: "custom", path: ["hsCode"], message: COPY.product });

    const value = parseMoney(v.unitValue);
    if (value === null || value <= 0) ctx.addIssue({ code: "custom", path: ["unitValue"], message: COPY.amount });
    else if (value > MAX_VALUE) ctx.addIssue({ code: "custom", path: ["unitValue"], message: COPY.tooLarge });

    const qty = parseInteger(v.quantity);
    if (qty === null || qty < 1 || qty > MAX_QUANTITY)
      ctx.addIssue({ code: "custom", path: ["quantity"], message: COPY.quantity });
  });
  return z
    .object({
      items: z.array(item).min(1),
      freight: z.string(),
      freightCurrency: z.enum(CURRENCIES),
      regime: z.enum(REGIME_CHOICES),
      etls: z.boolean(),
    })
    .superRefine((v, ctx) => {
      if (v.freight.trim() === "") return;
      const f = parseMoney(v.freight);
      if (f === null) ctx.addIssue({ code: "custom", path: ["freight"], message: COPY.freight });
      else if (f > MAX_VALUE) ctx.addIssue({ code: "custom", path: ["freight"], message: COPY.tooLarge });
    });
}

export function toRequest(values: FormValues): CalcRequest {
  const freight = values.freight.trim() === "" ? null : parseMoney(values.freight);
  return {
    items: values.items.map((v, i) => ({
      item_id: String(i + 1),
      hs_code: v.hsCode ?? "",
      unit_value: parseMoney(v.unitValue) ?? 0,
      quantity: parseInteger(v.quantity) ?? 1,
      currency: v.currency,
      origin_country: v.origin,
    })),
    ...(freight !== null ? { total_freight_insurance: freight, freight_currency: values.freightCurrency } : {}),
    ...(values.regime !== "auto" ? { regime: values.regime } : {}),
    ...(values.etls ? {} : { etls_applicable: false }),
  };
}

export function fromRequest(req: CalcRequest): FormValues {
  return {
    items: req.items.map((it) => ({
      hsCode: it.hs_code,
      unitValue: formatMoneyInput(String(it.unit_value)),
      currency: it.currency,
      quantity: String(it.quantity),
      origin: it.origin_country,
    })),
    freight: req.total_freight_insurance != null ? formatMoneyInput(String(req.total_freight_insurance)) : "",
    freightCurrency: req.freight_currency ?? req.items[0]?.currency ?? "USD",
    regime: req.regime ?? "auto",
    etls: req.etls_applicable ?? true,
  };
}

/** Maps API field paths ("items.0.unit_value") onto form paths ("items.0.unitValue"). */
const API_TO_FORM: Record<string, keyof FormItem> = {
  hs_code: "hsCode",
  unit_value: "unitValue",
  fob_value_fc: "unitValue",
  currency: "currency",
  quantity: "quantity",
  origin_country: "origin",
};

export function apiFieldToFormPath(path: string): `items.${number}.${keyof FormItem}` | "freight" | null {
  if (/total_freight_insurance/.test(path)) return "freight";
  const m = /^(?:body\.)?items\.(\d+)\.(\w+)$/.exec(path);
  if (!m) return null;
  const key = API_TO_FORM[m[2]];
  return key ? `items.${Number(m[1])}.${key}` : null;
}

/** Which form item a business-rule message is about ("Item 2: ..."). */
export function itemIndexFromMessage(detail: string): number | null {
  const m = /^Item (\d+):/.exec(detail);
  return m ? Number(m[1]) - 1 : null;
}
