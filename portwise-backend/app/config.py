"""Levy / VAT rates and tunables.

Defaults live here, but rows in the ``levy_config`` table (key / value) override
them, so the PHP admin panel can change a rate or switch the levy regime without
a code change.  Reads are cached for at most ``CACHE_TTL_SECONDS`` (PRD B7).

Supported keys in ``levy_config``:

    active_regime                   legacy | fob4 | both
    surcharge_pct                   % of the duty amount          (legacy regime)
    ciss_pct                        % of FOB                      (legacy regime)
    fob_charge_pct                  % of FOB                      (fob4 regime)
    etls_pct                        % of CIF
    vat_pct                         % of CIF + duty + levies
    default_freight_insurance_pct   % of FOB assumed when freight is not provided
    fx_stale_business_days          FX rate older than this is flagged as stale
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, replace
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Iterable, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import LevyConfigRow

log = logging.getLogger("portwise.config")

CACHE_TTL_SECONDS = 60
VALID_ACTIVE_REGIMES = ("legacy", "fob4", "both")

_PCT_KEYS = (
    "surcharge_pct",
    "ciss_pct",
    "fob_charge_pct",
    "etls_pct",
    "vat_pct",
    "default_freight_insurance_pct",
)


@dataclass(frozen=True)
class LevyRates:
    surcharge_pct: Decimal = Decimal("7")
    ciss_pct: Decimal = Decimal("1")
    fob_charge_pct: Decimal = Decimal("4")
    etls_pct: Decimal = Decimal("0.5")
    vat_pct: Decimal = Decimal("7.5")
    # Placeholder: the team should set the real figure through levy_config.
    default_freight_insurance_pct: Decimal = Decimal("10")
    fx_stale_business_days: int = 3
    # The status of the 4% FOB charge is unclear (PRD E7), so show both by default.
    active_regime: str = "both"

    def as_json(self) -> Dict[str, Any]:
        return {
            "active_regime": self.active_regime,
            "surcharge_pct": float(self.surcharge_pct),
            "ciss_pct": float(self.ciss_pct),
            "fob_charge_pct": float(self.fob_charge_pct),
            "etls_pct": float(self.etls_pct),
            "vat_pct": float(self.vat_pct),
            "default_freight_insurance_pct": float(self.default_freight_insurance_pct),
            "fx_stale_business_days": self.fx_stale_business_days,
        }


def _env_defaults() -> LevyRates:
    regime = os.getenv("PORTWISE_ACTIVE_REGIME", "both").strip().lower()
    if regime not in VALID_ACTIVE_REGIMES:
        log.warning("Ignoring invalid PORTWISE_ACTIVE_REGIME=%r", regime)
        regime = "both"
    return LevyRates(active_regime=regime)


def _apply_rows(base: LevyRates, rows: Iterable[Tuple[str, str]]) -> Tuple[LevyRates, bool]:
    updates: Dict[str, Any] = {}
    for raw_key, raw_value in rows:
        key = (raw_key or "").strip()
        value = (raw_value or "").strip()
        if key in _PCT_KEYS:
            try:
                number = Decimal(value)
            except InvalidOperation:
                log.warning("levy_config %s=%r is not a number; ignored", key, value)
                continue
            if not number.is_finite() or not (Decimal(0) <= number <= Decimal(100)):
                log.warning("levy_config %s=%r is outside 0-100; ignored", key, value)
                continue
            updates[key] = number
        elif key == "fx_stale_business_days":
            try:
                days = int(value)
            except ValueError:
                log.warning("levy_config %s=%r is not an integer; ignored", key, value)
                continue
            if not 0 <= days <= 30:
                log.warning("levy_config %s=%r is outside 0-30; ignored", key, value)
                continue
            updates[key] = days
        elif key == "active_regime":
            if value.lower() not in VALID_ACTIVE_REGIMES:
                log.warning("levy_config %s=%r is not one of %s; ignored", key, value, VALID_ACTIVE_REGIMES)
                continue
            updates[key] = value.lower()
    if not updates:
        return base, False
    return replace(base, **updates), True


_cache: Dict[str, Any] = {"at": 0.0, "value": None}


def clear_rates_cache() -> None:
    _cache["at"] = 0.0
    _cache["value"] = None


def get_levy_rates(db: Session) -> Tuple[LevyRates, str]:
    """Return ``(rates, source)`` where source is ``"database"`` or ``"defaults"``."""
    now = time.monotonic()
    cached = _cache["value"]
    if cached is not None and now - _cache["at"] < CACHE_TTL_SECONDS:
        return cached

    base = _env_defaults()
    try:
        rows = db.execute(select(LevyConfigRow.key, LevyConfigRow.value)).all()
    except Exception as exc:  # table missing or schema differs: fall back, never fail a request
        db.rollback()
        log.warning("Could not read levy_config (%s); using built-in defaults", exc)
        value: Tuple[LevyRates, str] = (base, "defaults")
    else:
        rates, applied = _apply_rows(base, [(r[0], r[1]) for r in rows])
        value = (rates, "database" if applied else "defaults")

    _cache["at"] = now
    _cache["value"] = value
    return value
