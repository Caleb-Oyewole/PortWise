import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from sqlalchemy.orm import Session

from app import service
from app.config import CACHE_TTL_SECONDS, get_levy_rates
from app.database import get_db
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
    except Exception:
        log.exception("Database initialisation failed; continuing so the service can report health")
    yield


app = FastAPI(
    title=os.getenv("APP_NAME", "PortWise API"),
    description="Landed-cost and import-duty calculator API for Nigerian importers.",
    version=VERSION,
    lifespan=lifespan,
)
app.add_exception_handler(PortWiseError, portwise_error_handler)


@app.get("/")
def root():
    """Liveness check. Rumpty's readiness probe and the frontend's warm-up call hit this; no database access."""
    return {"status": "online", "service": "PortWise API", "version": VERSION}


@app.get("/health")
def health_check():
    return {"status": "online", "service": "PortWise API", "version": VERSION}


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
