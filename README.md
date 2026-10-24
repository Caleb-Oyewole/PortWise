# PortWise

PortWise estimates the landed cost of imports into Nigeria: customs duty, levies, VAT and the exchange rate, itemized in naira, with the assumptions and warnings behind the number. Built for Devcenter Hacktober 2026 and hosted on Rumpty Cloud.

| Part | Folder | What it is |
| --- | --- | --- |
| API | `portwise-backend/` | FastAPI calculation engine, catalog endpoints and admin API. Tariff and FX data live in Postgres. |
| Web app | `portwise-frontend/` | React calculator at `/` and admin dashboard at `/admin`. |
| Tariff catalog | `portwise-backend/data/tariffs_2026.csv` | 32 sourced HS lines. `tariffs_2026_sources.csv` has the notes and URLs. |

## Run it locally

```bash
# API: http://localhost:8000, docs at /docs
cd portwise-backend
python -m venv .venv && .venv/Scripts/activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000

# Web app: http://localhost:5173
cd portwise-frontend
npm install
cp .env.example .env        # then set VITE_API_URL=http://localhost:8000
npm run dev
```

On SQLite (the default), start-up does the following:
- creates the tables
- loads the sample rows and the 2026 catalog
- fetches live exchange rates
- creates a dev admin, `admin@portwise.local` / `portwise-admin`

## Tests

```bash
cd portwise-backend && pytest              # API, engine, admin, migrations (83 tests)
cd portwise-frontend && npm test           # engine mirror, parsing, URL state, contract (32 tests)
cd portwise-frontend && npm run e2e        # browser tests, desktop and mobile
```

The reference check is the same in every suite: ₦3,000,000 FOB plus ₦450,000 freight at 20% duty gives ₦4,553,216.25 under the legacy regime and ₦4,598,043.75 under the 4% FOB charge.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/`, `/health` | Liveness check, no database access. The web app calls `/` on load to wake the app. |
| POST | `/api/v1/calculate` | One item. |
| POST | `/api/v1/calculate/multi` | A shipment. Freight is split by FOB value. Lines take `fob_value_fc`, or `unit_value` with `quantity`. |
| GET | `/api/v1/hs-codes` | Products with a tariff in force, grouped by category. |
| GET | `/api/v1/fx` | Exchange rates with source, age and stale or placeholder flags. |
| GET | `/api/v1/presets` | Demo scenarios available in this database. |
| GET | `/api/v1/config/regime` | Active regime and levy rates. |
| * | `/api/v1/admin/...` | Login, overview, tariffs (add, new rate, edit, retire, CSV import, load catalog), levy settings, FX (manual or refresh) and the audit log. Needs `Authorization: Bearer <token>`. |

Business-rule errors return HTTP 400 with `{success: false, code, detail}`. The codes are `prohibited_item`, `unsupported_goods`, `unknown_hs_code`, `no_tariff_in_force` and `unsupported_currency`. Invalid input returns 422. Full field reference: `/docs`.

### Calculation rules

- Every charge is rounded half-up to the kobo, and VAT and the totals are built from the rounded lines.
- `legacy` regime: 7% surcharge on duty plus 1% CISS on FOB. `fob4` regime: 4% of FOB replaces both. `both` (the default) shows each regime and leads with the higher total (`primary_regime`).
- ETLS is 0.5% of CIF. VAT is 7.5% of CIF + duty + levies.
- If freight is omitted, 10% of FOB is assumed and stated in `assumptions`.
- Import Adjustment Tax is flagged in `warnings` but not added, because its basis is unconfirmed.

## Environment variables (API)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite:///./portwise.db` | Database connection |
| `CORS_ORIGINS` | `*` | Comma-separated sites allowed to call the API |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | dev account on SQLite | The first admin. Set both in production. |
| `ADMIN_TOKEN_SECRET` | derived | Signs admin sessions. Set a long random value in production. |
| `FX_AUTO_REFRESH` | `1` | Refresh placeholder or old rates on start-up and every `FX_REFRESH_HOURS` (default 6) |
| `FX_API_KEY` | none | Optional ExchangeRate-API v6 key. Without it, the free open endpoint is used. |
| `FX_CURRENCIES` | `USD,EUR,GBP,CNY,AED` | Currencies to keep current |
| `AUTO_CREATE_TABLES`, `AUTO_MIGRATE` | `1` | Create missing tables, and upgrade older schemas in place |
| `AUTO_SEED`, `SEED_CATALOG` | `1` on SQLite only | Sample rows and the 2026 catalog |
| `PORTWISE_ACTIVE_REGIME` | `both` | Default regime when the admin has not set one |

## Deploying on Rumpty Cloud

1. **API** (existing app, `portwise-backend/Dockerfile`):
   - Deploy this branch.
   - Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET` and (optionally) `CORS_ORIGINS`.
   - On start-up the schema upgrades itself (`hs_codes` gains `category` and `keywords`, and uniqueness moves to `(code, effective_from)`), and FX rates refresh from the provider.
2. **Load the real tariffs** on the live database. Either:
   - sign in at `/admin`, go to Import, and choose "Preview the catalog", then Import; or
   - run `python -m scripts.load_catalog` with the live `DATABASE_URL`.
3. **Web app** (new app, `portwise-frontend/Dockerfile`, nginx, honours `$PORT`):
   - Build args: `VITE_API_URL=https://portwise.rumptycloud.app`, `VITE_SITE_URL=<the web app's URL>`, `VITE_USE_MOCKS=false`.
   - The admin dashboard is at `<web app>/admin`.

## Data caveat

Duty rates are read from the ECOWAS CET 2022–2027 schedule and checked against Nigeria's 2026 Fiscal Policy Measures. Two rows should be confirmed on the NCS portal before judging:
- the 5% IAT on smartphones, which is gazetted against the older code 8517.11
- the wax-print line 5208.52.10, which is 20% while similar lines are 35%

Estimates are for planning only; final charges are assessed by the Nigeria Customs Service.
