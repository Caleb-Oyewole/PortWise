import { forwardRef, type InputHTMLAttributes } from "react";
import type { Currency } from "@/lib/api/schemas";
import { CURRENCY_SYMBOL } from "@/lib/api/schemas";
import { cn } from "@/lib/cn";
import { formatMoneyInput } from "@/lib/parse";
import { inputClass } from "@/components/ui/primitives";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "inputMode" | "onChange"> & {
  currency: Currency;
  value: string;
  onValueChange: (v: string) => void;
  invalid?: boolean;
};

/** Text input with a decimal keypad, a currency prefix and comma formatting on blur. */
export const MoneyInput = forwardRef<HTMLInputElement, Props>(function MoneyInput(
  { currency, value, onValueChange, invalid, onBlur, className, ...rest },
  ref,
) {
  const symbol = CURRENCY_SYMBOL[currency];
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base font-medium text-pw-muted"
      >
        {symbol}
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={invalid || undefined}
        className={cn(inputClass(invalid), "pl-8", className)}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onBlur={(e) => {
          const formatted = formatMoneyInput(e.target.value.trim());
          if (formatted !== value) onValueChange(formatted);
          onBlur?.(e);
        }}
        {...rest}
      />
    </div>
  );
});
