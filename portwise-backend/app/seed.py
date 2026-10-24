import logging
import os
from datetime import datetime

from app.database import SessionLocal, engine, Base, DATABASE_URL
from app.models import AdminUser, AuditLog, FXRate, HSCodeTariff, LevyConfigRow  # noqa: F401  (registers every table)

log = logging.getLogger("portwise.seed")

# Marks seeded FX rows so the API can warn that they are not live CBN rates.
PLACEHOLDER_FX_SOURCE = "PLACEHOLDER seed rate (not live CBN)"


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def init_database() -> None:
    """Create tables and, for local development, seed sample data.

    AUTO_CREATE_TABLES (default on) creates any missing tables.
    AUTO_SEED defaults to on for SQLite and off for a managed database such as
    Postgres, where the full-stack dev owns the real data.
    """
    if _flag("AUTO_CREATE_TABLES", True):
        Base.metadata.create_all(bind=engine)
    if _flag("AUTO_MIGRATE", True):
        from app.migrations import upgrade
        upgrade(engine)
    if _flag("AUTO_SEED", DATABASE_URL.startswith("sqlite")):
        seed_database()


def seed_database():
    # Automatically create database tables if using SQLite / local dev
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        log.info("Starting PortWise database seeding...")

        existing_count = db.query(HSCodeTariff).count()
        if existing_count > 0:
            log.info("Tariff data already exists. Skipping seed.")
            return

        # NOTE: these rows are SAMPLE DATA for development and demos. The codes, rates
        # and source references have not been verified against the NTIP tariff or the
        # current Finance Act. Replace them with verified data before real use.
        tariffs = [
            HSCodeTariff(
                code="8517.12",
                description="Smartphones and telecommunication devices",
                duty_rate_pct=20.0,
                iat_rate_pct=0.0,
                prohibited=False,
                source_ref="NTIP CET 2026",
                hs_version="2022"
            ),
            HSCodeTariff(
                code="8437.10",
                description="Agricultural and industrial machinery (Zero duty)",
                duty_rate_pct=0.0,
                iat_rate_pct=0.0,
                prohibited=False,
                source_ref="2026 FPM Circular",
                hs_version="2022"
            ),
            HSCodeTariff(
                code="6204.62",
                description="Textiles and cotton garments",
                duty_rate_pct=20.0,
                iat_rate_pct=0.0,
                prohibited=False,
                source_ref="NTIP CET 2026",
                hs_version="2022"
            ),
            HSCodeTariff(
                code="3304.99",
                description="Cosmetics and beauty preparations",
                duty_rate_pct=20.0,
                iat_rate_pct=5.0,
                prohibited=False,
                source_ref="NTIP CET 2026",
                hs_version="2022"
            ),
            HSCodeTariff(
                code="PROHIBITED.01",
                description="Restricted/Banned food items from non-ECOWAS regions",
                duty_rate_pct=35.0,
                iat_rate_pct=0.0,
                prohibited=True,
                source_ref="April 2026 Fiscal Policy Circular",
                hs_version="2022"
            )
        ]

        db.add_all(tariffs)

        # Placeholder rates only: the API flags these in `warnings` until the real
        # FX job (or the admin panel) replaces them.
        fx_rates = [
            FXRate(currency="USD", rate_to_ngn=1550.0, source=PLACEHOLDER_FX_SOURCE, is_manual=True),
            FXRate(currency="EUR", rate_to_ngn=1680.5, source=PLACEHOLDER_FX_SOURCE, is_manual=True),
            FXRate(currency="GBP", rate_to_ngn=2010.0, source=PLACEHOLDER_FX_SOURCE, is_manual=True),
        ]

        db.add_all(fx_rates)
        db.commit()
        log.info("Database seeding completed successfully.")

    except Exception:
        db.rollback()
        log.exception("Error seeding database")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_database()
