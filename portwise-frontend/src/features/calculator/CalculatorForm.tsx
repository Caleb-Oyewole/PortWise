import { useState, type ReactNode } from "react";
import { Controller, useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { CURRENCIES, CURRENCY_NAME, MAX_ITEMS, ORIGINS, REGIME_NAME, type Currency } from "@/lib/api/schemas";
import type { useCatalog } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { formatPct } from "@/lib/format";
import { Button, describedBy, Field, Select, TextInput } from "@/components/ui/primitives";
import { FxBadge } from "@/features/results/FxBadge";
import { emptyItem, type FormValues } from "./form-model";
import { MoneyInput } from "./MoneyInput";
import { dutyHint, ProductCombobox } from "./ProductCombobox";

interface Props {
  form: UseFormReturn<FormValues>;
  catalog: ReturnType<typeof useCatalog>;
  onSubmit: () => void;
  pending: boolean;
  cooldown: boolean;
  alert?: ReactNode;
  hasResult: boolean;
  assumedFreightPct?: number;
  defaultRegime?: "legacy" | "fob4" | "both";
}

export function CalculatorForm({
  form,
  catalog,
  onSubmit,
  pending,
  cooldown,
  alert,
  hasResult,
  assumedFreightPct,
  defaultRegime,
}: Props) {
  const { control, formState, register } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const freightCurrency = useWatch({ control, name: "freightCurrency" });
  const regime = useWatch({ control, name: "regime" });
  const etls = useWatch({ control, name: "etls" });
  const currencies = [...new Set([...(items ?? []).map((i) => i.currency), freightCurrency])].filter(
    (c): c is Currency => !!c && c !== "NGN",
  );
  const multi = fields.length > 1;
  // Only products added with "Add another product" (created empty) fade in; a preset replaces the form instantly.
  const addedByUser = (index: number) => index > 0 && fields[index].hsCode === null && fields[index].unitValue === "";
  const [moreOpen, setMoreOpen] = useState(false);
  const optionsChanged = regime !== "auto" || !etls;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      aria-labelledby="form-title"
      className="rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-6"
    >
      <h2 id="form-title" className="text-lg/[26px] font-semibold text-pw-navy">
        Your shipment
      </h2>
      <p className="mt-1 text-sm text-pw-muted">Use the prices on your supplier's invoice.</p>

      <div className="mt-5 flex flex-col">
        {fields.map((f, index) => (
          <fieldset
            key={f.id}
            className={cn("min-w-0", multi && "border-t border-pw-border first:border-t-0", addedByUser(index) && "pw-enter")}
          >
            <div className={cn(multi && "py-5", multi && index === 0 && "pt-0")}>
              <legend className="sr-only">Product {index + 1}</legend>
              {multi && (
                <div className="mb-3 flex items-center justify-between">
                  <span aria-hidden="true" className="text-[15px] font-semibold text-pw-navy">
                    Product {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-pw-muted hover:bg-pw-coral-50 hover:text-pw-coral"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    Remove<span className="sr-only"> product {index + 1}</span>
                  </button>
                </div>
              )}
              <ItemFields form={form} index={index} catalog={catalog} />
            </div>
          </fieldset>
        ))}
      </div>

      {fields.length < MAX_ITEMS && (
        <Button
          type="button"
          variant="ghost"
          className="-ml-2 mt-1 px-2"
          onClick={() => {
            const last = items?.[items.length - 1];
            append(emptyItem(last?.currency ?? "USD", last?.origin ?? "CN"), { shouldFocus: true });
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add another product
        </Button>
      )}

      <div className="mt-4 border-t border-pw-border pt-5">
        <div className="grid grid-cols-6 gap-x-3">
          <Controller
            control={control}
            name="freight"
            render={({ field, fieldState }) => (
              <Field
                id="freight"
                className="col-span-4"
                label="Freight and insurance"
                hint={
                  assumedFreightPct != null
                    ? `For the whole shipment. Leave empty to assume ${formatPct(assumedFreightPct)} of the goods value.`
                    : "For the whole shipment. Optional."
                }
                error={fieldState.error?.message}
              >
                <MoneyInput
                  id="freight"
                  ref={field.ref}
                  currency={freightCurrency ?? "USD"}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="0.00"
                  invalid={!!fieldState.error}
                  aria-describedby={describedBy("freight", fieldState.error?.message, true)}
                />
              </Field>
            )}
          />
          <Field id="freight-currency" className="col-span-2" label="Currency">
            <Select id="freight-currency" {...register("freightCurrency")}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c} title={CURRENCY_NAME[c]}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls="more-options"
          onClick={() => setMoreOpen((o) => !o)}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-pw-blue hover:text-pw-blue-700"
        >
          More options{optionsChanged && !moreOpen ? " (changed)" : ""}
          <ChevronDown className={cn("size-4 transition-transform duration-200", moreOpen && "rotate-180")} aria-hidden="true" />
        </button>
        <div id="more-options" hidden={!moreOpen} className="mt-2 space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold text-pw-text">Levy regime</legend>
            <p className="mt-0.5 text-[13px] leading-5 text-pw-muted">
              Customs has used two sets of levies recently. Compare both to see the range.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["auto", defaultRegime === "both" || !defaultRegime ? "Compare both (default)" : `Default (${REGIME_NAME[defaultRegime]})`],
                  ["both", "Compare both"],
                  ["legacy", REGIME_NAME.legacy],
                  ["fob4", REGIME_NAME.fob4],
                ] as const
              )
                .filter(([v]) => !(v === "both" && (defaultRegime === "both" || !defaultRegime)))
                .map(([v, label]) => (
                  <label
                    key={v}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--radius-input)] border px-3 text-sm",
                      regime === v ? "border-pw-blue bg-pw-blue-50 text-pw-navy" : "border-pw-input text-pw-text",
                    )}
                  >
                    <input type="radio" value={v} {...register("regime")} className="size-4 accent-[var(--color-pw-blue)]" />
                    {label}
                  </label>
                ))}
            </div>
          </fieldset>
          <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-pw-text">
            <input type="checkbox" {...register("etls")} className="mt-0.5 size-4 accent-[var(--color-pw-blue)]" />
            <span>
              Include the ECOWAS trade levy (ETLS)
              <span className="block text-[13px] text-pw-muted">Untick for goods where an agent has confirmed it does not apply.</span>
            </span>
          </label>
        </div>
      </div>

      {alert && <div className="mt-4">{alert}</div>}

      <Button
        type="submit"
        className="mt-5 h-12 w-full text-[15px]"
        loading={pending}
        loadingLabel="Calculating your landed cost"
        disabled={cooldown}
      >
        {hasResult ? "Recalculate" : "Calculate landed cost"}
      </Button>

      <div className="mt-3 flex flex-col gap-1" aria-live="polite">
        {currencies.map((c) => (
          <FxBadge key={c} currency={c} />
        ))}
      </div>
      {formState.submitCount > 0 && !formState.isValid && Object.keys(formState.errors).length > 0 && (
        <p className="sr-only" role="alert">
          Some fields need attention. The first one has been focused.
        </p>
      )}
    </form>
  );
}

function ItemFields({ form, index, catalog }: { form: UseFormReturn<FormValues>; index: number; catalog: Props["catalog"] }) {
  const { control, register, formState } = form;
  const errs = formState.errors.items?.[index];
  const item = useWatch({ control, name: `items.${index}` });
  const hs = item?.hsCode ? catalog.byCode.get(item.hsCode) : undefined;
  const p = `item-${index}`;
  const productHint = hs ? `HS ${hs.code}, ${dutyHint(hs)}${hs.prohibited ? ". Restricted unless from ECOWAS" : ""}` : undefined;

  return (
    <div className="grid grid-cols-6 gap-x-3 gap-y-4">
      <Controller
        control={control}
        name={`items.${index}.hsCode`}
        render={({ field, fieldState }) => (
          <Field
            id={`${p}-product`}
            className="col-span-6"
            label="Product or HS code"
            hint={productHint}
            error={fieldState.error?.message}
          >
            <ProductCombobox
              id={`${p}-product`}
              value={field.value}
              onChange={(v) => field.onChange(v)}
              onBlur={field.onBlur}
              inputRef={field.ref}
              catalog={catalog}
              error={fieldState.error?.message}
              describedById={describedBy(`${p}-product`, fieldState.error?.message, !!productHint)}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name={`items.${index}.unitValue`}
        render={({ field, fieldState }) => (
          <Field id={`${p}-value`} className="col-span-4" label="Price per unit" error={fieldState.error?.message}>
            <MoneyInput
              id={`${p}-value`}
              ref={field.ref}
              currency={item?.currency ?? "USD"}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              placeholder="0.00"
              invalid={!!fieldState.error}
              aria-describedby={describedBy(`${p}-value`, fieldState.error?.message)}
            />
          </Field>
        )}
      />

      <Field id={`${p}-currency`} className="col-span-2" label="Currency">
        <Select id={`${p}-currency`} {...register(`items.${index}.currency`)}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c} title={CURRENCY_NAME[c]}>
              {c}
            </option>
          ))}
        </Select>
      </Field>

      <Field id={`${p}-qty`} className="col-span-2" label="Quantity" error={errs?.quantity?.message}>
        <TextInput
          id={`${p}-qty`}
          inputMode="numeric"
          autoComplete="off"
          invalid={!!errs?.quantity}
          aria-describedby={describedBy(`${p}-qty`, errs?.quantity?.message)}
          {...register(`items.${index}.quantity`)}
        />
      </Field>

      <Field id={`${p}-origin`} className="col-span-4" label="Shipped from">
        <Select id={`${p}-origin`} {...register(`items.${index}.origin`)}>
          {ORIGINS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
