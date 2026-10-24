"""Small, idempotent schema upgrades for databases created before a model change.

``Base.metadata.create_all`` creates missing tables but never alters existing ones,
so the live database needs these steps. Each one checks the current schema first,
so running them on every start-up is safe. Set AUTO_MIGRATE=0 to skip them.
"""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

log = logging.getLogger("portwise.migrations")

HS_TABLE = "hs_codes"
NEW_HS_COLUMNS = {"category": "VARCHAR(60)", "keywords": "VARCHAR(255)"}
UNIQUE_VERSION_INDEX = "uq_hs_codes_code_effective_from"


def upgrade(engine: Engine) -> list[str]:
    """Apply pending upgrades and return a description of each one applied."""
    applied: list[str] = []
    insp = inspect(engine)
    if HS_TABLE not in insp.get_table_names():
        return applied

    with engine.begin() as conn:
        columns = {c["name"] for c in insp.get_columns(HS_TABLE)}
        for name, sql_type in NEW_HS_COLUMNS.items():
            if name not in columns:
                conn.execute(text(f"ALTER TABLE {HS_TABLE} ADD COLUMN {name} {sql_type}"))
                applied.append(f"added {HS_TABLE}.{name}")

        # Older databases made `code` unique, which blocks keeping a rate history.
        for index in insp.get_indexes(HS_TABLE):
            if index.get("unique") and index.get("column_names") == ["code"]:
                conn.execute(text(f"DROP INDEX {index['name']}"))
                conn.execute(text(f"CREATE INDEX {index['name']} ON {HS_TABLE} (code)"))
                applied.append(f"made {index['name']} non-unique")
        if engine.dialect.name == "postgresql":
            for constraint in insp.get_unique_constraints(HS_TABLE):
                if constraint.get("column_names") == ["code"]:
                    conn.execute(text(f'ALTER TABLE {HS_TABLE} DROP CONSTRAINT "{constraint["name"]}"'))
                    applied.append(f"dropped unique constraint {constraint['name']}")

        names = {i["name"] for i in insp.get_indexes(HS_TABLE)}
        names |= {c["name"] for c in insp.get_unique_constraints(HS_TABLE)}
        if UNIQUE_VERSION_INDEX not in names:
            conn.execute(text(
                f"CREATE UNIQUE INDEX {UNIQUE_VERSION_INDEX} ON {HS_TABLE} (code, effective_from)"
            ))
            applied.append(f"added unique ({HS_TABLE}.code, effective_from)")

    for step in applied:
        log.info("Schema upgrade: %s", step)
    return applied
