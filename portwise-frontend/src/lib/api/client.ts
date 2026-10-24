import type { z } from "zod";
import { ErrorBody } from "./schemas";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/** Error codes the UI knows how to explain, plus client-side ones. */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "HS_CODE_NOT_FOUND"
  | "NO_DUTY_RATE"
  | "FX_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "NETWORK"
  | "TIMEOUT"
  | "CONTRACT"
  | "ABORTED"
  | (string & {});

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string>;
  readonly requestId?: string;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    fields?: Record<string, string>,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
  }
}

export async function http<T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  init: RequestInit = {},
  timeoutMs = 10_000,
): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout.signal]) : timeout.signal;

  try {
    const res = await fetch(BASE + path, {
      ...init,
      signal,
      headers: { Accept: "application/json", "Content-Type": "application/json", ...init.headers },
    });
    const requestId = res.headers.get("X-Request-ID") ?? undefined;
    const body: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const parsed = ErrorBody.safeParse(body);
      const err = parsed.success ? parsed.data.error : undefined;
      const code = err?.code ?? (res.status === 429 ? "RATE_LIMITED" : res.status >= 500 ? "INTERNAL_ERROR" : "UNKNOWN");
      throw new ApiError(res.status, code, err?.message ?? res.statusText, err?.fields, requestId);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      if (import.meta.env.DEV) console.error(`Contract mismatch on ${path}`, parsed.error.issues, body);
      throw new ApiError(res.status, "CONTRACT", "The server sent a response this app does not understand.", undefined, requestId);
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
