import { useEffect, useState } from "react";
import { Clock, TriangleAlert } from "lucide-react";
import { useFx } from "@/lib/api/hooks";
import type { Currency } from "@/lib/api/schemas";
import { cn } from "@/lib/cn";
import { formatRate, relativeTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/primitives";

/** Re-renders every 30 s so "updated 2 min ago" stays true. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** The rate that will be used, shown before the user commits. */
export function FxBadge({ currency, className }: { currency: Currency; className?: string }) {
  const fx = useFx(currency);
  const now = useNow();

  if (currency === "NGN") {
    return <p className={cn("text-[13px] text-pw-muted", className)}>Prices in naira need no conversion.</p>;
  }
  if (fx.isLoading) {
    return (
      <div className={cn("flex h-5 items-center", className)} aria-label="Loading exchange rate">
        <Skeleton className="h-3.5 w-56" />
      </div>
    );
  }
  if (fx.isError || !fx.data) {
    return (
      <p className={cn("flex items-center gap-1.5 text-[13px] text-pw-amber-text", className)} role="status">
        <TriangleAlert className="size-3.5" aria-hidden="true" />
        Live rates are unavailable right now. Please try again shortly.
      </p>
    );
  }
  const { rate, fetched_at, stale } = fx.data;
  return stale ? (
    <p className={cn("inline-flex items-center gap-1.5 rounded-full bg-pw-amber-50 px-2.5 py-1 text-[13px] text-pw-amber-text", className)}>
      <TriangleAlert className="size-3.5" aria-hidden="true" />
      <span className="num">{formatRate(currency, rate)}</span>, the latest available rate from {relativeTime(fetched_at, now)}.
    </p>
  ) : (
    <p className={cn("flex items-center gap-1.5 text-[13px] text-pw-muted", className)}>
      <Clock className="size-3.5" aria-hidden="true" />
      <span>
        <span className="num font-medium text-pw-text">{formatRate(currency, rate)}</span>, updated{" "}
        {relativeTime(fetched_at, now)}
      </span>
    </p>
  );
}
