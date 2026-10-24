import { cn } from "@/lib/cn";

export interface Part {
  key: "cif" | "duty" | "levies" | "vat";
  label: string;
  value: number;
  color: string;
}

export const PART_COLORS = {
  cif: "#1D5FD1",
  duty: "#F5B700",
  levies: "#C93B31",
  vat: "#6D4AE0",
} as const;

const MIN_PCT = 1.2; // keeps tiny parts visible; the legend carries the exact figure

/**
 * The cost split, drawn as the side of a shipping container. Cargo (the four
 * cost parts) loads left to right; widths are exact shares of the total.
 */
export function ContainerBar({ parts, revealKey, empty }: { parts: Part[]; revealKey: number; empty?: boolean }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shares = parts.map((p) => (total > 0 ? (p.value / total) * 100 : 0));
  // Bump tiny shares to the minimum and take the difference from the largest part.
  const widths = shares.map((s) => (s > 0 ? Math.max(MIN_PCT, s) : 0));
  const overflow = widths.reduce((a, b) => a + b, 0) - 100;
  if (overflow > 0) {
    const big = widths.indexOf(Math.max(...widths));
    widths[big] -= overflow;
  }
  const description = parts.map((p, i) => `${p.label} ${shares[i].toFixed(1)}%`).join(", ");

  return (
    <div
      role="img"
      aria-label={empty ? "Empty container: no costs calculated yet" : `Cost split: ${description}`}
      className="relative"
    >
      {/* Corner castings */}
      {["left-0 top-0", "right-0 top-0", "left-0 bottom-0", "right-0 bottom-0"].map((pos) => (
        <span key={pos} aria-hidden="true" className={cn("absolute z-20 size-2 bg-pw-navy", pos)} />
      ))}
      <div className="relative flex h-14 overflow-hidden border-2 border-pw-navy bg-[#eef2f8] sm:h-16">
        {/* Cargo */}
        <div key={revealKey} className={cn("relative flex h-full flex-1", !empty && "pw-load")}>
          {!empty &&
            parts.map((p, i) => (
              <span
                key={p.key}
                className={cn(
                  "h-full transition-[width] duration-300 ease-[var(--ease-out)]",
                  p.key === "duty" && "shadow-[inset_0_0_0_1px_#B07A00]",
                  i > 0 && "border-l border-white/70",
                )}
                style={{ width: `${widths[i]}%`, backgroundColor: p.color }}
              />
            ))}
          <span aria-hidden="true" className={cn("absolute inset-0", empty ? "pw-ridges-empty" : "pw-ridges")} />
        </div>
        {/* End doors with locking bars */}
        <span aria-hidden="true" className="relative flex w-7 shrink-0 justify-evenly border-l-2 border-pw-navy bg-[#dfe6f0] sm:w-9">
          <span className="my-1.5 w-[3px] rounded-full bg-pw-navy/70" />
          <span className="my-1.5 w-[3px] rounded-full bg-pw-navy/70" />
        </span>
      </div>
    </div>
  );
}
