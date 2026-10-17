import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

export function useToast(durationMs = 2600) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback(
    (m: string) => {
      clearTimeout(timer.current);
      setMessage(m);
      timer.current = setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return { message, show };
}

/** Polite confirmation; the live region is always mounted so it is announced. */
export function Toast({ message }: { message: string | null }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-8">
      {message && (
          <p
            key={message}
            className="pw-toast inline-flex items-center gap-2 rounded-full bg-pw-navy px-4 py-2.5 text-sm font-medium text-white shadow-[var(--shadow-pop)]"
          >
            <Check className="size-4 text-pw-amber" aria-hidden="true" />
            {message}
          </p>
        )}
    </div>
  );
}
