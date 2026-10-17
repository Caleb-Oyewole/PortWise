import { useState, type ReactNode } from "react";
import { Controller, useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { CURRENCIES, CURRENCY_NAME, MAX_ITEMS, type Currency } from "@/lib/api/schemas";
import type { useCatalog } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { formatPct } from "@/lib/format";
import { Button, describedBy, Field, Select, TextInput } from "@/components/ui/primitives";
import { FxBadge } from "@/features/results/FxBadge";
import { emptyItem, needsWeight, type FormValues } from "./form-model";
import { MoneyInput } from "./MoneyInput";
import { ProductCombobox } from "./ProductCombobox";

interface Props {
  form: UseFormReturn<FormValues>;
  catalog: ReturnType<typeof useCatalog>;
  onSubmit: () => void;
  pending: boolean;
  cooldown: boolean;
  alert?: ReactNode;
  hasResult: boolean;
}

export function CalculatorForm({ form, catalog, onSubmit, pending, cooldown, alert, hasResult }: Props) {
  const { control, formState } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const currencies = [...new Set((items ?? []).map((i) => i.currency))] as Currency[];
  const multi = fields.length > 1;
  // Only products added with "Add another product" (created empty) animate in;
  // a preset or shared link replaces the form instantly.
  const addedByUser = (index: number) => index > 0 && fields[index].hsCodeId === null && fields[index].unitValue === "";

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
        Your goods
      </h2>
      <p className="mt-1 text-sm text-pw-muted">Use the prices on your supplier's invoice.</p>

      <div className="mt-5 flex flex-col">
        {fields.map((f, index) => (
            <fieldset
              key={f.id}
              className={cn("min-w-0", multi && "border-t border-pw-border first:border-t-0", addedByUser(index) && "pw-enter")}
            >
              <div className={cn(multi && "py-5 group-first:pt-0", multi && index === 0 && "pt-0")}>
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
            append(emptyItem(items?.[items.length - 1]?.currency ?? "USD"), { shouldFocus: true });
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add another product
        </Button>
      )}

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
  const hs = item?.hsCodeId != null ? catalog.hsById.get(item.hsCodeId) : undefined;
  const weightNeeded = needsWeight(hs);
  const [showShipping, setShowShipping] = useState(() => !!item?.shipping);
  const shippingOpen = showShipping || !!item?.shipping || !!errs?.shipping;
  const p = `item-${index}`;

  const productHint = hs
    ? `HS ${hs.code}, ${hs.rate_type === "per_kg" ? "duty charged per kg" : `import duty ${formatPct(hs.duty_pct ?? 0)}`}`
    : undefined;

  return (
    <div className="grid grid-cols-6 gap-x-3 gap-y-4">
      <Controller
        control={control}
        name={`items.${index}.hsCodeId`}
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
          <Field
            id={`${p}-value`}
            className="col-span-4"
            label="Price per unit"
            error={fieldState.error?.message}
          >
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

      <Field
        id={`${p}-qty`}
        className={cn(weightNeeded ? "col-span-3" : "col-span-2")}
        label="Quantity"
        error={errs?.quantity?.message}
      >
        <TextInput
          id={`${p}-qty`}
          inputMode="numeric"
          autoComplete="off"
          invalid={!!errs?.quantity}
          aria-describedby={describedBy(`${p}-qty`, errs?.quantity?.message)}
          {...register(`items.${index}.quantity`)}
        />
      </Field>

      {weightNeeded && (
        <Field id={`${p}-weight`} className="col-span-3" label="Total weight (kg)" error={errs?.weight?.message}>
          <TextInput
            id={`${p}-weight`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            invalid={!!errs?.weight}
            aria-describedby={describedBy(`${p}-weight`, errs?.weight?.message)}
            {...register(`items.${index}.weight`)}
          />
        </Field>
      )}

      {shippingOpen ? (
        <Controller
          control={control}
          name={`items.${index}.shipping`}
          render={({ field, fieldState }) => (
            <Field
              id={`${p}-shipping`}
              className={cn(weightNeeded ? "col-span-6" : "col-span-4")}
              label="Shipping and insurance"
              hint="Optional. Added to the customs value."
              error={fieldState.error?.message}
            >
              <MoneyInput
                id={`${p}-shipping`}
                ref={field.ref}
                currency={item?.currency ?? "USD"}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="0.00"
                invalid={!!fieldState.error}
                aria-describedby={describedBy(`${p}-shipping`, fieldState.error?.message, true)}
              />
            </Field>
          )}
        />
      ) : (
        <div className={cn("flex items-end", weightNeeded ? "col-span-6" : "col-span-4")}>
          <button
            type="button"
            onClick={() => {
              setShowShipping(true);
              requestAnimationFrame(() => document.getElementById(`${p}-shipping`)?.focus());
            }}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-md text-left text-sm font-semibold text-pw-blue hover:text-pw-blue-700 hover:underline"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add shipping and insurance
          </button>
        </div>
      )}
    </div>
  );
}
