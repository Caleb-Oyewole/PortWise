import { useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(query);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** True when the person has asked their device to reduce motion. */
export const useReducedMotion = () =>
  useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
