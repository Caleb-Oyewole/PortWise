// Mocked data is never presented as live: whenever the mock API is on, the
// header shows a "Demo data" badge. Turn it on with VITE_USE_MOCKS=true, or
// with ?demo=1 on any URL (remembered for the tab; ?demo=0 turns it off).
const KEY = "pw-demo";

function readSession(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeSession(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* storage blocked: demo mode simply lasts for this page load */
  }
}

export function resolveDemoMode(): boolean {
  const params = new URLSearchParams(location.search);
  const demo = params.get("demo");
  if (demo === "1") writeSession(KEY, "1");
  if (demo === "0") writeSession(KEY, null);
  const fail = params.get("mockfail");
  if (fail) writeSession("pw-mockfail", fail === "off" ? null : fail.toUpperCase());
  if (demo !== null || fail !== null) {
    params.delete("demo");
    params.delete("mockfail");
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
  }
  return import.meta.env.VITE_USE_MOCKS === "true" || readSession(KEY) === "1" || demo === "1";
}

let active = false;
export const isDemoMode = () => active;
export const setDemoActive = (v: boolean) => {
  active = v;
};
