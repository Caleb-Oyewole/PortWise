// Admin API client: bearer token in sessionStorage, typed endpoints, sign-out on 401.
import { z } from "zod";
import { ApiError, http } from "@/lib/api/client";

const TOKEN_KEY = "pw-admin-token";

export const tokenStore = {
  get(): string | null {
    try {
      const raw = sessionStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      const { token, expires_at } = JSON.parse(raw) as { token: string; expires_at: number };
      return expires_at * 1000 > Date.now() ? token : null;
    } catch {
      return null;
    }
  },
  set(token: string, expires_at: number) {
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expires_at }));
    } catch {
      /* storage blocked: the session lasts for this page only */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

let onUnauthorized: () => void = () => undefined;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function adminHttp<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  try {
    return await http(`/api/v1/admin${path}`, schema, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && path !== "/login") {
      tokenStore.clear();
      onUnauthorized();
    }
    throw e;
  }
}

const json = (body: unknown, method = "POST"): RequestInit => ({ method, body: JSON.stringify(body) });

// ---------- schemas ----------

export const Admin = z.object({ id: z.number(), email: z.string(), name: z.string() });
export type Admin = z.infer<typeof Admin>;

export const LoginResponse = z.object({ token: z.string(), expires_at: z.number(), admin: Admin });

export const AuditEntry = z.object({
  id: z.number(),
  admin_email: z.string().nullable(),
  entity: z.string(),
  entity_id: z.string().nullable(),
  action: z.string(),
  summary: z.string().nullable(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  created_at: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const Overview = z.object({
  tariffs: z.object({
    in_force: z.number(),
    versions: z.number(),
    scheduled: z.number(),
    categories: z.number(),
    missing_source: z.number(),
  }),
  fx: z.object({ currencies: z.number(), placeholder: z.array(z.string()), stale: z.array(z.string()) }),
  levy: z.object({ active_regime: z.string(), config_source: z.string() }),
  recent_changes: z.array(AuditEntry),
});
export type Overview = z.infer<typeof Overview>;

export const Tariff = z.object({
  id: z.number(),
  code: z.string(),
  description: z.string(),
  category: z.string().nullable(),
  keywords: z.string().nullable(),
  duty_rate_pct: z.number(),
  iat_rate_pct: z.number(),
  prohibited: z.boolean(),
  source_ref: z.string().nullable(),
  hs_version: z.string().nullable(),
  effective_from: z.string(),
  effective_to: z.string().nullable(),
  status: z.enum(["in_force", "scheduled", "retired"]),
});
export type Tariff = z.infer<typeof Tariff>;
export const TariffList = z.object({ items: z.array(Tariff), categories: z.array(z.string()) });

export const ImportReport = z.object({
  dry_run: z.boolean(),
  counts: z.record(z.string(), z.number()),
  rows: z.array(
    z.object({
      row: z.number(),
      code: z.string(),
      status: z.string(),
      duty_rate_pct: z.number().optional(),
      message: z.string().optional(),
    }),
  ),
});
export type ImportReport = z.infer<typeof ImportReport>;

export const LevySetting = z.object({
  key: z.string(),
  label: z.string(),
  value: z.union([z.number(), z.string()]),
  default: z.union([z.number(), z.string()]),
  override: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type LevySetting = z.infer<typeof LevySetting>;
export const LevyConfig = z.object({ config_source: z.string(), settings: z.array(LevySetting) });

export const AdminFx = z.object({
  rates: z.array(
    z.object({
      currency: z.string(),
      rate: z.number(),
      source: z.string(),
      as_of_date: z.string(),
      stale: z.boolean(),
      placeholder: z.boolean(),
      is_manual: z.boolean(),
      age_business_days: z.number(),
    }),
  ),
  provider_currencies: z.array(z.string()),
  stale_after_business_days: z.number(),
  updated: z.array(z.string()).optional(),
});
export type AdminFx = z.infer<typeof AdminFx>;

export const AuditPage = z.object({ total: z.number(), items: z.array(AuditEntry) });

// ---------- endpoints ----------

export interface TariffInput {
  code: string;
  description: string;
  category?: string | null;
  keywords?: string | null;
  duty_rate_pct: number;
  iat_rate_pct?: number;
  prohibited?: boolean;
  source_ref?: string | null;
  effective_from?: string | null;
}

export const adminApi = {
  login: (email: string, password: string) => adminHttp("/login", LoginResponse, json({ email, password })),
  me: () => adminHttp("/me", Admin),
  overview: () => adminHttp("/overview", Overview),
  tariffs: (q = "", status = "") =>
    adminHttp(`/tariffs?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`, TariffList),
  addTariff: (body: TariffInput) => adminHttp("/tariffs", Tariff, json(body)),
  editTariff: (id: number, body: Partial<TariffInput>) => adminHttp(`/tariffs/${id}`, Tariff, json(body, "PATCH")),
  retireTariff: (id: number) => adminHttp(`/tariffs/${id}/retire`, Tariff, { method: "POST" }),
  importCsv: (csv: string, dry_run: boolean) => adminHttp("/tariffs/import", ImportReport, json({ csv, dry_run })),
  loadCatalog: (dry_run: boolean) => adminHttp("/tariffs/load-catalog", ImportReport, json({ dry_run })),
  levyConfig: () => adminHttp("/levy-config", LevyConfig),
  saveLevyConfig: (values: Record<string, string | null>) => adminHttp("/levy-config", LevyConfig, json({ values }, "PUT")),
  fx: () => adminHttp("/fx", AdminFx),
  setFx: (currency: string, rate_to_ngn: number, source?: string) =>
    adminHttp(`/fx/${encodeURIComponent(currency)}`, AdminFx, json({ rate_to_ngn, source }, "PUT")),
  refreshFx: (keep_manual: boolean) => adminHttp("/fx/refresh", AdminFx, json({ keep_manual })),
  audit: (entity = "", offset = 0, limit = 30) =>
    adminHttp(
      `/audit-log?${new URLSearchParams({ ...(entity ? { entity } : {}), offset: String(offset), limit: String(limit) })}`,
      AuditPage,
    ),
};

export const CSV_TEMPLATE =
  "code,description,category,keywords,duty_rate_pct,iat_rate_pct,prohibited,source_ref,hs_version,effective_from\n" +
  '8517.13,Smartphones,Phones and electronics,"phone iphone android",10,5,no,"ECOWAS CET 2022-27, 8517130000",2022,\n';
