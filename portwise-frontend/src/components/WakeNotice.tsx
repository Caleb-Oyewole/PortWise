import { useEffect, useState } from "react";
import { onWakeChange } from "@/lib/api/client";

/** Shown while Rumpty starts the sleeping API container (usually a few seconds). */
export function WakeNotice() {
  const [waking, setWaking] = useState(false);
  useEffect(() => onWakeChange(setWaking), []);
  if (!waking) return null;
  return (
    <p role="status" className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-pw-on-navy">
      <span className="pw-dot text-pw-amber" aria-hidden="true" />
      Starting the calculator server. This takes a few seconds the first time.
    </p>
  );
}
