import type { z } from "zod";
import { RuleError, ValidationError } from "./schemas";

export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "prohibited_item"
  | "unsupported_goods"
  | "unknown_hs_code"
  | "no_tariff_in_force"
  | "unsupported_currency"
  | "unauthorized"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "NETWORK"
  | "TIMEOUT"
  | "WAKING"
  | "CONTRACT"
  | "ABORTED"
  | (string & {});

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string>;

  constructor(status: number, code: ApiErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

// ---------- server wake-up (Rumpty sleeps idle apps) ----------

type WakeListener = (waking: boolean) => void;
const wakeListeners = new Set<WakeListener>();
let waking = false;

function setWaking(value: boolean) {
  if (waking === value) return;
  waking = value;
  wakeListeners.forEach((l) => l(value));
}

export function onWakeChange(listener: WakeListener) {
  wakeListeners.add(listener);
  listener(waking);
  return () => {
    wakeListeners.delete(listener);
  };
}

const WAKE_MARKER = "data-rumpty-wake";
const WAKE_BUDGET_MS = 75_000;

/** Rumpty answers 503 with a "Waking your app" HTML page while the API container starts. */
function isWakePage(res: Response, text: string) {
  return text.includes(WAKE_MARKER) || (res.status === 503 && (res.headers.get("content-type") ?? "").includes("text/html"));
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

/** Fire-and-forget warm-up on page load so the API is awake by the time someone calculates. */
export function wakeApi() {
  void fetch(`${API_BASE}/`, { cache: "no-store" })
    .then(async (res) => {
      if (isWakePage(res, await res.text())) {
        setWaking(true);
        const started = Date.now();
        while (Date.now() - started < WAKE_BUDGET_MS) {
          await sleep(2500);
          const again = await fetch(`${API_BASE}/`, { cache: "no-store" }).catch(() => null);
          if (again && !isWakePage(again, await again.text())) break;
        }
      }
    })
    .catch(() => undefined)
    .finally(() => setWaking(false));
}

// ---------- requests ----------

function fieldsFrom422(body: unknown): Record<string, string> | undefined {
  const parsed = ValidationError.safeParse(body);
  if (!parsed.success) return undefined;
  const fields: Record<string, string> = {};
  for (const issue of parsed.data.detail) {
    const path = issue.loc.filter((p) => p !== "body").join(".");
    fields[path || "_"] = issue.msg.replace(/^Value error, /, "");
  }
  return fields;
}

export async function http<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<T> {
  const started = Date.now();
  for (;;) {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout.signal]) : timeout.signal;
    try {
      const res = await fetch(API_BASE + path, {
        ...init,
        signal,
        headers: { Accept: "application/json", "Content-Type": "application/json", ...init.headers },
      });
      const text = await res.text();

      if (isWakePage(res, text)) {
        if (Date.now() - started > WAKE_BUDGET_MS) {
          setWaking(false);
          throw new ApiError(503, "WAKING", "The server is taking too long to start.");
        }
        setWaking(true);
        clearTimeout(timer);
        await sleep(2500, init.signal ?? undefined);
        continue;
      }
      setWaking(false);

      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }

      if (!res.ok) {
        const rule = RuleError.safeParse(body);
        if (rule.success) throw new ApiError(res.status, rule.data.code, rule.data.detail);
        if (res.status === 422) {
          throw new ApiError(422, "VALIDATION_ERROR", "Some details need another look.", fieldsFrom422(body));
        }
        if (res.status === 429) throw new ApiError(429, "RATE_LIMITED", "Too many requests.");
        throw new ApiError(res.status, res.status >= 500 ? "INTERNAL_ERROR" : "UNKNOWN", res.statusText || "Request failed");
      }

      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        if (import.meta.env.DEV) console.error(`Contract mismatch on ${path}`, parsed.error.issues, body);
        throw new ApiError(res.status, "CONTRACT", "The server sent a response this app does not understand.");
      }
      return parsed.data;
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")) {
        if (init.signal?.aborted) throw new ApiError(0, "ABORTED", "The request was replaced by a newer one.");
        throw new ApiError(0, "TIMEOUT", "The request timed out.");
      }
      if (e instanceof TypeError) throw new ApiError(0, "NETWORK", "The server could not be reached.");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
