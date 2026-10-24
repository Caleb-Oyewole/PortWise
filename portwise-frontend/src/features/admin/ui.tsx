import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** Modal dialog on the native <dialog> element: focus trap, Esc and backdrop come free. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      aria-labelledby="dialog-title"
      className={cn(
        "m-auto w-[calc(100%-2rem)] rounded-[var(--radius-card)] bg-white p-0 text-pw-text shadow-[var(--shadow-pop)] backdrop:bg-pw-navy/40",
        wide ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="dialog-title" className="font-display text-lg font-semibold text-pw-navy">
                {title}
              </h2>
              {description && <p className="mt-1 text-sm text-pw-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex size-10 shrink-0 items-center justify-center rounded-md text-pw-muted hover:bg-pw-bg hover:text-pw-navy"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold text-pw-navy">{title}</h1>
        {description && <p className="mt-1 max-w-[62ch] text-[15px] text-pw-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const PILL: Record<string, string> = {
  in_force: "bg-pw-green-50 text-pw-green",
  scheduled: "bg-pw-blue-50 text-pw-blue-700",
  retired: "bg-[#eef1f5] text-pw-muted",
  warn: "bg-pw-amber-50 text-pw-amber-text",
  error: "bg-pw-coral-50 text-[#a3271f]",
  ok: "bg-pw-green-50 text-pw-green",
};

export function Pill({ tone, children }: { tone: keyof typeof PILL | string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", PILL[tone] ?? PILL.retired)}>
      {children}
    </span>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-[var(--radius-card)] border border-pw-border bg-white", className)}>{children}</section>;
}

const TIME = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
export const formatWhen = (iso: string) => TIME.format(new Date(iso.endsWith("Z") ? iso : `${iso}Z`));
const DAY = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric" });
export const formatDay = (iso: string) => DAY.format(new Date(iso.endsWith("Z") ? iso : `${iso}Z`));
