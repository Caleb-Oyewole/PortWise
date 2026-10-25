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

# What to tell the operator for each kind of connection failure. These are fixed strings:
# nothing from the driver's message (host, user, database name) is ever copied into them.
DB_FAILURE_HINTS = {
    "host_not_found": "The host in DATABASE_URL can't be found. Copy the connection string again from Rumpty's "
                      "managed Postgres page (use the internal/private URL if one is offered), and check the "
                      "database is in the same project and region.",
    "authentication_failed": "The username or password in DATABASE_URL was rejected. Copy them again from the "
                             "managed Postgres page; special characters in the password must be URL-encoded.",
    "ssl_required": "The database requires an encrypted connection. Add ?sslmode=require to the end of DATABASE_URL.",
    "connection_refused": "The database refused the connection. It may be stopped or paused, or not attached to "
                          "this app. Start it or attach it in Rumpty.",
    "timeout": "The database did not answer in time. It may be stopped or paused, or blocked by a firewall. "
               "Start it, and check the app is allowed to reach it.",
    "database_missing": "The database name at the end of DATABASE_URL does not exist on that server. "
                        "Check the name on the managed Postgres page.",
    "unknown": "The cause is not one of the common ones. Search Rumpty's runtime logs for 'Readiness check failed'.",
}


def classify_db_error(exc: BaseException) -> tuple:
    """Return ``(cause, hint)`` for a database connection failure, without leaking its details."""
    text = str(exc).lower()
    if any(m in text for m in ("could not translate host name", "name or service not known",
                               "nodename nor servname", "temporary failure in name resolution",
                               "getaddrinfo failed")):
        cause = "host_not_found"
    elif "password authentication failed" in text or "authentication failed" in text or (
        'role "' in text and "does not exist" in text
    ):
        cause = "authentication_failed"
    elif "pg_hba.conf" in text and "no encryption" in text or "ssl" in text and "required" in text or (
        "server does not support ssl" not in text and "sslmode" in text
    ):
        cause = "ssl_required"
    elif "database" in text and "does not exist" in text:
        cause = "database_missing"
    elif "connection refused" in text:
        cause = "connection_refused"
    elif "timeout" in text or "timed out" in text:
        cause = "timeout"
    else:
        cause = "unknown"
    return cause, DB_FAILURE_HINTS[cause]


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency injection for database sessions in FastAPI endpoints."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
