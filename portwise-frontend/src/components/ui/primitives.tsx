import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { ChevronDown, CircleAlert, Info, TriangleAlert, CircleCheck } from "lucide-react";
import { cn } from "@/lib/cn";

// ---------- Button ----------

type ButtonVariant = "primary" | "secondary" | "ghost" | "on-navy";

const buttonBase =
  "relative inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--radius-button)] px-4 text-sm font-semibold " +
  "transition-[background-color,border-color,color,box-shadow] duration-200 ease-[var(--ease-out)] " +
  "disabled:cursor-not-allowed select-none";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-pw-navy text-white hover:bg-pw-navy-800 active:bg-pw-navy-700 disabled:bg-[#c9d3e1] disabled:text-pw-muted",
  secondary:
    "border border-pw-input bg-white text-pw-navy hover:border-pw-navy hover:bg-pw-bg disabled:text-pw-muted disabled:border-pw-border",
  ghost: "text-pw-blue hover:bg-pw-blue-50 hover:text-pw-blue-700 disabled:text-pw-muted",
  "on-navy":
    "border border-white/35 text-white hover:border-white hover:bg-white/10 disabled:opacity-60",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", loading, loadingLabel, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonBase, buttonVariants[variant], className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {/* Keep the label in the layout while loading so the button never changes width. */}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center gap-1.5" aria-hidden="true">
          <span className="pw-dot" />
          <span className="pw-dot [animation-delay:120ms]" />
          <span className="pw-dot [animation-delay:240ms]" />
        </span>
      )}
      {loading && loadingLabel && <span className="sr-only">{loadingLabel}</span>}
    </button>
  );
});

// ---------- Field ----------

export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-pw-text">
        {label}
        {optional && <span className="font-normal text-pw-muted"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-[13px] leading-5 text-pw-coral">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] leading-5 text-pw-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const describedBy = (id: string, error?: string, hint?: boolean) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

const inputBase =
  "h-12 w-full min-w-0 rounded-[var(--radius-input)] border bg-white px-3 text-base text-pw-text num " +
  "placeholder:text-[#7d8ba0] transition-[border-color,box-shadow] duration-150 " +
  "focus:outline-none focus-visible:outline-none focus:border-pw-blue focus:ring-[3px] focus:ring-pw-blue/20 " +
  "disabled:bg-pw-bg disabled:text-pw-muted";

export const inputClass = (invalid?: boolean) =>
  cn(inputBase, invalid ? "border-pw-coral bg-pw-coral-50 focus:border-pw-coral focus:ring-pw-coral/20" : "border-pw-input");

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ invalid, className, ...rest }, ref) {
    return <input ref={ref} aria-invalid={invalid || undefined} className={cn(inputClass(invalid), className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ invalid, className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(inputClass(invalid), "cursor-pointer appearance-none pr-9 font-medium", className)}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-pw-muted"
          aria-hidden="true"
        />
      </div>
    );
  },
);

// ---------- Alert ----------

type Tone = "info" | "warning" | "error" | "success";
const toneStyles: Record<Tone, { box: string; icon: typeof Info }> = {
  info: { box: "bg-pw-blue-50 text-pw-navy border-pw-blue/25", icon: Info },
  warning: { box: "bg-pw-amber-50 text-pw-amber-text border-pw-amber-edge/30", icon: TriangleAlert },
  error: { box: "bg-pw-coral-50 text-[#a3271f] border-pw-coral/30", icon: CircleAlert },
  success: { box: "bg-pw-green-50 text-pw-green border-pw-green/30", icon: CircleCheck },
};

export function Alert({
  tone,
  title,
  children,
  action,
  className,
  live = true,
}: {
  tone: Tone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  live?: boolean;
}) {
  const { box, icon: Icon } = toneStyles[tone];
  return (
    <div
      role={live ? (tone === "error" ? "alert" : "status") : undefined}
      className={cn("flex gap-3 rounded-[var(--radius-input)] border px-3.5 py-3 text-sm", box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 leading-5 opacity-90">{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

// ---------- Skeleton ----------

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("pw-shimmer block rounded-md bg-[#e6ecf4]", className)} />;
}
