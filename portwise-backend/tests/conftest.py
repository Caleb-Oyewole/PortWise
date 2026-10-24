import os
import tempfile

# Must be set before app.database is imported.
_DB_FILE = os.path.join(tempfile.mkdtemp(prefix="portwise-test-"), "test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_FILE}"
os.environ["AUTO_SEED"] = "1"
os.environ["AUTO_CREATE_TABLES"] = "1"
os.environ.pop("PORTWISE_ACTIVE_REGIME", None)

import pytest
from fastapi.testclient import TestClient

from app.config import clear_rates_cache
from app.database import Base, SessionLocal, engine


@pytest.fixture(autouse=True)
def _fresh_cache():
    clear_rates_cache()
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
