# PortWise

PortWise estimates the landed cost of imports into Nigeria: duty, statutory levies, VAT and the total, with the assumptions and warnings behind the number. Built for the Devcenter Hacktober 2026 sprint (hosted on Rumpty Cloud).

## Project structure

- `portwise-backend/` - FastAPI application
  - `app/main.py` - routes (thin)
  - `app/service.py` - tariff and FX lookup, rule checks, response building
  - `app/calculator.py` - exact `Decimal` landed-cost arithmetic
  - `app/config.py` - levy rates and the active regime, read from `levy_config` with a 60 s cache
  - `app/rules.py` - ECOWAS members and unsupported goods
  - `app/errors.py` - business-rule errors
  - `tests/` - unit, API and independent-oracle tests
  - `scripts/crosscheck.py` - builds a CSV for checking results against the NTIP calculator
- `portwise-frontend/` - React calculator UI (see `portwise-frontend/README.md`)
- `render.yaml` - deployment configuration for Render

## Run locally

```bash
cd portwise-backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

On SQLite (the default) the tables are created and sample data is seeded on startup. Docs: http://localhost:8000/docs

## Tests

```bash
cd portwise-backend
pytest
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` and `/health` | Liveness check. No database access, so it is safe as the readiness path and as the frontend's warm-up call. |
| POST | `/api/v1/calculate` | One item. |
| POST | `/api/v1/calculate/multi` | A shipment; shared freight is split in proportion to FOB value. |
| GET | `/api/v1/config/regime` | Active regime, levy rates in force and tariff versions. |

### Calculation rules

- Every charge is rounded half-up to the kobo; VAT and totals are built from the rounded lines.
- VAT is 7.5% of CIF + duty + levies.
- `regime`: `legacy` (7% surcharge on duty + 1% CISS on FOB), `fob4` (4% of FOB replaces both) or `both`. If omitted the admin-configured `active_regime` is used (default `both`, because the status of the 4% FOB charge is unclear). With `both`, the headline `data` is the higher total and `scenarios` holds each.
- ETLS is 0.5% of CIF and can be switched off with `etls_applicable`.
- If `freight_insurance` (or `total_freight_insurance_ngn`) is omitted, `default_freight_insurance_pct` of FOB is assumed and stated in `assumptions`. Send `0` to mean none.
- Import Adjustment Tax is not applied (its basis is unconfirmed); a warning is returned when a code carries one.
- The FX source and date are returned; a rate older than `fx_stale_business_days` is flagged stale, and a custom `fx_rate_override` is labelled as such.
- `sensitivity_shifts_pct` (up to 9 values between -50 and 100) sets the naira moves tested; default `[-5, 0, 5, 10]`.

### Errors

Business-rule failures return HTTP 400 with `{"success": false, "code": "...", "detail": "..."}`.

| code | meaning |
|---|---|
| `prohibited_item` | On the import prohibition list and not from an ECOWAS origin |
| `unsupported_goods` | Vehicles, alcohol and tobacco are not supported in this version |
| `unknown_hs_code` | The code is not in the tariff data |
| `no_tariff_in_force` | The code exists but has no rate in force today |
| `unsupported_currency` | No exchange rate for that currency (send `fx_rate_override`) |

Invalid input (negative values, bad regime and so on) returns 422.

### `levy_config` keys

A key/value table that overrides the defaults; changes show within 60 seconds.

`active_regime` (legacy / fob4 / both), `surcharge_pct`, `ciss_pct`, `fob_charge_pct`, `etls_pct`, `vat_pct`, `default_freight_insurance_pct`, `fx_stale_business_days`. Invalid values are ignored.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./portwise.db` | Database connection |
| `PORT` | `8000` | Port used by the Docker image |
| `AUTO_CREATE_TABLES` | `1` | Create missing tables on startup |
| `AUTO_SEED` | `1` on SQLite, `0` otherwise | Insert sample tariff and FX rows when the tariff table is empty |
| `PORTWISE_ACTIVE_REGIME` | `both` | Default regime when `levy_config` has none |
| `APP_NAME` | `PortWise API` | API title |

## Data caveat

The seeded tariff rows and FX rates are development samples, not verified data. Seeded FX rows are labelled `PLACEHOLDER` and the API warns on them. Replace both with verified data before real use.
## Frontend

The calculator UI lives in `portwise-frontend/` (Vite, React and TypeScript). 

```bash
cd portwise-frontend
npm install
cp .env.example .env
npm run dev   # http://localhost:5173
```

See `portwise-frontend/README.md` for the API contract the UI expects, demo mode and deployment.
