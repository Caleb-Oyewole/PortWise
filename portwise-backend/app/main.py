import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import catalog, service
from app.admin.auth import ensure_bootstrap_admin
from app.admin.routes import router as admin_router
from app.fx_provider import start_background_refresh, stop_background_refresh
from app.limits import BodySizeLimit, RateLimit
from app.config import CACHE_TTL_SECONDS, get_levy_rates
from app.database import SessionLocal, get_db
from app.errors import PortWiseError, portwise_error_handler
from app.schemas import CalculateRequest, MultiCalculateRequest
from app.seed import init_database

VERSION = "2.1.0"
log = logging.getLogger("portwise")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables (and seed sample data locally) so a fresh database does not crash requests.
    # A database that is down must not stop the process from answering / and /health.
    try:
        init_database()
        ensure_bootstrap_admin()
    except Exception:
        log.exception("Database initialisation failed; continuing so the service can report health")
    start_background_refresh()
    yield
    stop_background_refresh()


app = FastAPI(
    title=os.getenv("APP_NAME", "PortWise API"),
    description="Landed-cost and import-duty calculator API for Nigerian importers.",
    version=VERSION,
    lifespan=lifespan,
)
app.add_exception_handler(PortWiseError, portwise_error_handler)
app.include_router(catalog.router)
# Admin endpoints work as before but are left out of the public /docs.
app.include_router(admin_router, include_in_schema=False)


def _cors_origins() -> list[str]:
    """CORS_ORIGINS is a comma-separated list; "*" (the default) allows any site.

    The public API holds no user data and the admin API uses bearer tokens, not
    cookies, so allowing any origin is safe; set the list to lock it down.
    """
    raw = os.getenv("CORS_ORIGINS", "*").strip()
    return ["*"] if raw in ("", "*") else [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


# Added first so CORS (added last, outermost) also decorates their 413 / 429 responses.
app.add_middleware(RateLimit)
app.add_middleware(BodySizeLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)


@app.get("/")
def root():
    """Liveness check. Rumpty's readiness probe and the frontend's warm-up call hit this; no database access."""
    return {"status": "online", "service": "PortWise API", "version": VERSION}


@app.get("/health")
def health_check():
    return {"status": "online", "service": "PortWise API", "version": VERSION}


@app.get("/health/ready")
def readiness():
    """Checks the database too: 200 when calculations can run, 503 (with the reason) when not."""
    from fastapi.responses import JSONResponse
    from sqlalchemy import text

    from app.database import engine
    from app.models import HSCodeTariff

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db = SessionLocal()
        try:
            tariffs = db.query(HSCodeTariff).count()
        finally:
            db.close()
    except Exception as exc:  # report the kind of failure, never connection details
        log.exception("Readiness check failed")
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "database": engine.dialect.name, "error": type(exc).__name__},
        )
    return {"status": "ready", "database": engine.dialect.name, "tariff_rows": tariffs, "version": VERSION}


@app.post("/api/v1/calculate")
def calculate_landed_cost_endpoint(payload: CalculateRequest, db: Session = Depends(get_db)):
    """Landed cost for one item: tariff and FX lookup, levy scenarios, sensitivity table."""
    return service.calculate_single(db, payload)


@app.post("/api/v1/calculate/multi")
def calculate_multi_item_shipment(payload: MultiCalculateRequest, db: Session = Depends(get_db)):
    """Landed cost for a shipment; shared freight and insurance is split in proportion to FOB value."""
    return service.calculate_multi(db, payload)


@app.get("/api/v1/config/regime")
def get_regime_config(db: Session = Depends(get_db)):
    """The levy regime and rates currently in force, and the tariff versions in the database."""
    rates, source = get_levy_rates(db)
    now = service.utcnow()
    rows = db.query(service.HSCodeTariff).all()
    versions = sorted({
        f"{r.source_ref or 'unversioned'}@{r.effective_from:%Y-%m-%d}"
        for r in rows
        if r.effective_from <= now and (r.effective_to is None or r.effective_to > now)
    })
    return {
        "active_regime": rates.active_regime,
        "config_source": source,
        "cache_ttl_seconds": CACHE_TTL_SECONDS,
        "rates": rates.as_json(),
        "rate_versions_in_force": versions,
    }
