import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export const GLOSSARY = {
  cif: "The value customs charges duty on: the goods plus insurance and freight, converted to naira.",
  fob: "What you pay the supplier for the goods alone, converted to naira.",
  duty: "A percentage of the customs value, set by the product's tariff line (HS code).",
  levies: "Smaller fixed-rate charges added by the customs system. Each one is listed by name.",
  vat: "Value-added tax on the goods plus duty and levies.",
  hs: "The international product code that decides which duty rate applies.",
  fx: "How many naira one unit of your invoice currency buys, at the time shown.",
} as const;

/** A term with a plain-language definition. Tap or focus to open; Esc closes. */
export function GlossaryTerm({ term, children, className }: { term: keyof typeof GLOSSARY; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className={cn(
          "cursor-help rounded-sm text-left underline decoration-pw-input decoration-dotted decoration-1 underline-offset-[5px] hover:decoration-pw-navy",
          className,
        )}
      >
        {children}
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className="absolute left-0 top-[calc(100%+8px)] z-40 w-64 rounded-[10px] bg-pw-navy px-3 py-2.5 text-[13px] font-normal leading-5 text-white shadow-[var(--shadow-pop)]"
      >
        {GLOSSARY[term]}
      </span>
    </span>
  );
}
