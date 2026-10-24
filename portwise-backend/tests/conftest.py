import os
import tempfile

# Must be set before app.database is imported.
_DB_FILE = os.path.join(tempfile.mkdtemp(prefix="portwise-test-"), "test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_FILE}"
os.environ["AUTO_SEED"] = "1"
os.environ["AUTO_CREATE_TABLES"] = "1"
os.environ["SEED_CATALOG"] = "0"  # tests use the small fixed sample set
os.environ["FX_AUTO_REFRESH"] = "0"  # never call the live FX provider from tests
os.environ["PBKDF2_ITERATIONS"] = "1000"  # fast password hashing in tests
os.environ["PORTWISE_DEV"] = "1"  # tests sign in with the local development admin
for _var in ("ADMIN_EMAIL", "ADMIN_PASSWORD", "ADMIN_TOKEN_SECRET"):
    os.environ.pop(_var, None)
os.environ.pop("PORTWISE_ACTIVE_REGIME", None)

import pytest
from fastapi.testclient import TestClient

from app.config import clear_rates_cache
from app.database import Base, SessionLocal, engine


@pytest.fixture(autouse=True)
def _fresh_cache():
    from app.limits import reset_rate_limit

    clear_rates_cache()
    reset_rate_limit()
    yield
    clear_rates_cache()


@pytest.fixture()
def client():
    """A client backed by a freshly seeded database for every test."""
    Base.metadata.drop_all(bind=engine)
    with TestClient(app_instance()) as c:  # runs the lifespan: create tables + seed
        yield c


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def app_instance():
    from app.main import app
    return app
