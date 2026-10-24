// What the form holds (strings, as typed) and how it becomes an API request.
import { z } from "zod";
import {
  CURRENCIES,
  MAX_QUANTITY,
  MAX_VALUE,
  type CalcItemRequest,
  type CalcRequest,
  type HsCode,
} from "@/lib/api/schemas";
import { formatMoneyInput, parseInteger, parseMoney, parseWeight } from "@/lib/parse";

export const COPY = {
  product: "Choose a product or HS code.",
  amount: "Enter an amount greater than 0.",
  tooLarge: "That amount is too large for this tool.",
  quantity: "Quantity must be a whole number, 1 or more.",
  shipping: "Enter shipping and insurance as an amount, or leave it empty.",
  weight: "Enter the total weight in kg. This product's duty is charged per kg.",
} as const;

export const FormItem = z.object({
  hsCodeId: z.number().nullable(),
  unitValue: z.string(),
  currency: z.enum(CURRENCIES),
  quantity: z.string(),
  shipping: z.string(),
  weight: z.string(),
});
export type FormItem = z.infer<typeof FormItem>;
export type FormValues = { items: FormItem[] };

export const emptyItem = (currency: FormItem["currency"] = "USD"): FormItem => ({
  hsCodeId: null,
  unitValue: "",
  currency,
  quantity: "1",
  shipping: "",
  weight: "",
});

export const needsWeight = (hs: HsCode | undefined) =>
  !!hs && (hs.needs_weight === true || hs.rate_type === "per_kg");

/** Builds the validation schema. Weight rules depend on the chosen product. */
export function makeFormSchema(hsById: Map<number, HsCode>) {
  const item = FormItem.superRefine((v, ctx) => {
    if (v.hsCodeId === null) ctx.addIssue({ code: "custom", path: ["hsCodeId"], message: COPY.product });

    const value = parseMoney(v.unitValue);
    if (value === null || value <= 0) ctx.addIssue({ code: "custom", path: ["unitValue"], message: COPY.amount });
    else if (value > MAX_VALUE) ctx.addIssue({ code: "custom", path: ["unitValue"], message: COPY.tooLarge });

    const qty = parseInteger(v.quantity);
    if (qty === null || qty < 1 || qty > MAX_QUANTITY)
      ctx.addIssue({ code: "custom", path: ["quantity"], message: COPY.quantity });

    if (v.shipping.trim() !== "") {
      const s = parseMoney(v.shipping);
      if (s === null) ctx.addIssue({ code: "custom", path: ["shipping"], message: COPY.shipping });
      else if (s > MAX_VALUE) ctx.addIssue({ code: "custom", path: ["shipping"], message: COPY.tooLarge });
    }

    const hs = v.hsCodeId === null ? undefined : hsById.get(v.hsCodeId);
    if (needsWeight(hs)) {
      const w = parseWeight(v.weight);
      if (w === null || w <= 0) ctx.addIssue({ code: "custom", path: ["weight"], message: COPY.weight });
    }
  });
  return z.object({ items: z.array(item).min(1) });
}

export function toRequest(values: FormValues, hsById: Map<number, HsCode>): CalcRequest {
  return {
    items: values.items.map((v): CalcItemRequest => {
      const hs = v.hsCodeId === null ? undefined : hsById.get(v.hsCodeId);
      const shipping = v.shipping.trim() === "" ? null : parseMoney(v.shipping);
      return {
        hs_code_id: v.hsCodeId ?? 0,
        unit_value: parseMoney(v.unitValue) ?? 0,
        currency: v.currency,
        quantity: parseInteger(v.quantity) ?? 1,
        shipping_insurance: shipping && shipping > 0 ? shipping : null,
        weight_kg: needsWeight(hs) ? parseWeight(v.weight) : null,
      };
    }),
  };
}

export function fromRequest(req: CalcRequest): FormValues {
  return {
    items: req.items.map((it) => ({
      hsCodeId: it.hs_code_id,
      unitValue: formatMoneyInput(String(it.unit_value)),
      currency: it.currency,
      quantity: String(it.quantity),
      shipping: it.shipping_insurance ? formatMoneyInput(String(it.shipping_insurance)) : "",
      weight: it.weight_kg ? String(it.weight_kg) : "",
    })),
  };
}

/** Maps API field paths ("items.0.unit_value") onto form paths ("items.0.unitValue"). */
const API_TO_FORM: Record<string, keyof FormItem> = {
  hs_code_id: "hsCodeId",
  category_slug: "hsCodeId",
  unit_value: "unitValue",
  currency: "currency",
  quantity: "quantity",
  shipping_insurance: "shipping",
  weight_kg: "weight",
};

export function apiFieldToFormPath(path: string): `items.${number}.${keyof FormItem}` | null {
  const m = /^(?:body\.)?items\.(\d+)\.(\w+)$/.exec(path);
  if (!m) return null;
  const key = API_TO_FORM[m[2]];
  return key ? `items.${Number(m[1])}.${key}` : null;
}
