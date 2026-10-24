# PortWise API

FastAPI service: the landed-cost engine, catalog endpoints and the admin API. See the [main README](../README.md) for the overview, demo script, deployment and API summary; the live reference is at `/docs`.

```bash
python -m venv .venv && .venv/Scripts/activate   # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
PORTWISE_DEV=1 uvicorn app.main:app --reload --port 8000
pytest
```

| Path | What it is |
| --- | --- |
| `app/calculator.py` | Exact-decimal landed-cost arithmetic (both levy regimes) |
| `app/service.py` | Tariff and FX lookup, rules, warnings, assumptions, sensitivity |
| `app/catalog.py` | Public reads: `/hs-codes`, `/fx`, `/presets` |
| `app/admin/` | Sign-in (`auth.py`), admin API (`routes.py`), audit log |
| `app/fx_provider.py` | Live exchange rates and the background refresh |
| `app/limits.py` | Body-size cap and the calculator rate limit |
| `app/migrations.py` | In-place schema upgrades for existing databases |
| `data/tariffs_2026.csv` | The sourced tariff catalog (`scripts/load_catalog.py` loads it) |
| `tests/` | Engine, API, catalog, admin, migrations and security tests |
