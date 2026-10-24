import logging
import os
import tempfile

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

log = logging.getLogger("portwise.database")


def _default_sqlite_url() -> str:
    """Local SQLite when DATABASE_URL is not set.

    Uses ./portwise.db when the working directory is writable, otherwise the temp
    directory: some hosts mount the app folder read-only, and SQLite must be able to
    create the file. Data in the temp directory does not survive a restart, so set
    DATABASE_URL to a managed Postgres for anything beyond a demo.
    """
    if os.access(os.getcwd(), os.W_OK):
        return "sqlite:///./portwise.db"
    path = os.path.join(tempfile.gettempdir(), "portwise.db")
    log.warning("DATABASE_URL is not set and the app folder is read-only; using temporary SQLite at %s", path)
    return f"sqlite:///{path}"


def normalize_database_url(url: str) -> str:
    """Accept the URL forms hosts hand out; SQLAlchemy rejects the bare postgres:// scheme."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    # Ensure explicit psycopg2 driver usage for PostgreSQL
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url


DATABASE_URL = normalize_database_url(os.getenv("DATABASE_URL", "").strip() or _default_sqlite_url())

# Configure engine arguments based on whether we are using SQLite or PostgreSQL
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # pool_pre_ping drops connections the managed database closed while the app was asleep
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency injection for database sessions in FastAPI endpoints."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
