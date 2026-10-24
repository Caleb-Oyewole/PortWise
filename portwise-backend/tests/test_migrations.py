"""The live database predates the versioned-tariff schema; the upgrade must fix it in place."""
from datetime import datetime, timedelta

from sqlalchemy import create_engine, inspect, text

from app.migrations import upgrade


def _legacy_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE hs_codes (id INTEGER PRIMARY KEY, code VARCHAR(20) NOT NULL, "
            "description VARCHAR(255) NOT NULL, duty_rate_pct FLOAT NOT NULL, iat_rate_pct FLOAT, "
            "prohibited BOOLEAN, effective_from DATETIME, effective_to DATETIME, "
            "source_ref VARCHAR(100), hs_version VARCHAR(20))"
        ))
        conn.execute(text("CREATE UNIQUE INDEX ix_hs_codes_code ON hs_codes (code)"))
        conn.execute(text(
            "INSERT INTO hs_codes (code, description, duty_rate_pct, effective_from) "
            "VALUES ('8517.12', 'Phones', 20, :d)"
        ), {"d": datetime(2026, 1, 1)})
    return engine


def test_upgrade_adds_columns_and_allows_rate_history(tmp_path):
    engine = _legacy_db(tmp_path)
    applied = upgrade(engine)
    assert any("category" in a for a in applied)
    cols = {c["name"] for c in inspect(engine).get_columns("hs_codes")}
    assert {"category", "keywords"} <= cols
    with engine.begin() as conn:  # a second version of the same code is now allowed
        conn.execute(text(
            "INSERT INTO hs_codes (code, description, duty_rate_pct, effective_from) "
            "VALUES ('8517.12', 'Phones', 10, :d)"
        ), {"d": datetime(2026, 1, 1) + timedelta(days=30)})
    assert upgrade(engine) == []  # idempotent


def test_upgrade_rejects_duplicate_version(tmp_path):
    engine = _legacy_db(tmp_path)
    upgrade(engine)
    import pytest
    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError), engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO hs_codes (code, description, duty_rate_pct, effective_from) "
            "VALUES ('8517.12', 'Dup', 5, :d)"
        ), {"d": datetime(2026, 1, 1)})
