import { cn } from "@/lib/cn";

/** The mark: a container end-on (three ridges) with the amber signal dot. */
export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  const box = inverted ? "#FFFFFF" : "#0B2545";
  const ridge = inverted ? "#0B2545" : "#FFFFFF";
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill={box} />
      <rect x="8.5" y="9" width="3" height="14" rx="1.5" fill={ridge} />
      <rect x="14.5" y="9" width="3" height="14" rx="1.5" fill={ridge} />
      <rect x="20.5" y="12" width="3" height="11" rx="1.5" fill={ridge} />
      <circle cx="24.5" cy="7.5" r="3" fill="#F5B700" />
    </svg>
  );
}

export function Wordmark({ inverted }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark inverted={inverted} />
      <span
        className={cn(
          "font-display text-[19px] font-semibold tracking-[-0.01em]",
          inverted ? "text-white" : "text-pw-navy",
        )}
      >
        PortWise
      </span>
    </span>
  );
}
