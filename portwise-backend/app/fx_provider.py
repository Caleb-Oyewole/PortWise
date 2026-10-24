"""Live exchange rates from ExchangeRate-API, and a background job that keeps them fresh.

Without FX_API_KEY the free open endpoint (open.er-api.com) is used; with a key, the
v6 API. Both quote every currency against USD, so X -> NGN = NGN per USD / X per USD.
"""
from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Iterable, List, Optional

import requests

from app.database import SessionLocal
from app.models import FXRate

log = logging.getLogger("portwise.fx")

DEFAULT_CURRENCIES = ("USD", "EUR", "GBP", "CNY", "AED")
PROVIDER_LABEL = "ExchangeRate-API market rate"


def configured_currencies() -> List[str]:
    raw = os.getenv("FX_CURRENCIES", ",".join(DEFAULT_CURRENCIES))
    return [c.strip().upper() for c in raw.split(",") if len(c.strip()) == 3]


@dataclass
class Quote:
    currency: str
    rate_to_ngn: Decimal
    as_of: datetime


class FxProviderError(Exception):
    pass


def fetch_quotes(currencies: Iterable[str], timeout: float = 8.0) -> List[Quote]:
    key = os.getenv("FX_API_KEY", "").strip()
    url = f"https://v6.exchangerate-api.com/v6/{key}/latest/USD" if key else "https://open.er-api.com/v6/latest/USD"
    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        body = response.json()
    except (requests.RequestException, ValueError) as exc:
        # The keyed URL contains FX_API_KEY, and requests puts the URL in its messages:
        # never pass exception text on to callers, logs or the admin UI.
        status = getattr(getattr(exc, "response", None), "status_code", None)
        detail = f"HTTP {status}" if status else type(exc).__name__
        raise FxProviderError(f"Could not reach the exchange-rate provider ({detail}).") from None
    rates = body.get("conversion_rates") or body.get("rates") or {}
    if body.get("result") != "success" or "NGN" not in rates:
        raise FxProviderError(f"The exchange-rate provider returned no NGN rate ({body.get('error-type', 'unknown error')}).")
    stamp = body.get("time_last_update_unix")
    as_of = datetime.fromtimestamp(stamp, timezone.utc).replace(tzinfo=None) if stamp else datetime.utcnow()
    ngn_per_usd = Decimal(str(rates["NGN"]))
    quotes = []
    for currency in currencies:
        per_usd = rates.get(currency)
        if not per_usd:
            continue
        rate = (ngn_per_usd / Decimal(str(per_usd))).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
        quotes.append(Quote(currency, rate, as_of))
    return quotes


def apply_quotes(db, quotes: List[Quote], keep_manual: bool) -> Dict[str, Dict[str, object]]:
    """Upsert quotes into fx_rates. With keep_manual, rates an admin typed in are left alone."""
    changes: Dict[str, Dict[str, object]] = {}
    for quote in quotes:
        row = db.query(FXRate).filter(FXRate.currency == quote.currency).first()
        placeholder = bool(row and (row.source or "").upper().startswith("PLACEHOLDER"))
        if row and keep_manual and row.is_manual and not placeholder:
            continue
        before = None if row is None else {"rate_to_ngn": row.rate_to_ngn, "source": row.source}
        if row is None:
            row = FXRate(currency=quote.currency)
            db.add(row)
        row.rate_to_ngn = float(quote.rate_to_ngn)
        row.source = PROVIDER_LABEL
        row.as_of_date = quote.as_of
        row.is_manual = False
        changes[quote.currency] = {"before": before, "after": {"rate_to_ngn": row.rate_to_ngn, "source": row.source}}
    return changes


def needs_refresh(db, max_age_hours: float) -> bool:
    rows = db.query(FXRate).all()
    if not rows:
        return True
    now = datetime.utcnow()
    for row in rows:
        if (row.source or "").upper().startswith("PLACEHOLDER"):
            return True
        if not row.is_manual and (now - row.as_of_date).total_seconds() > max_age_hours * 3600:
            return True
    return False


# ---------- background job ----------

_stop = threading.Event()
_thread: Optional[threading.Thread] = None


def _refresh_once(max_age_hours: float) -> None:
    db = SessionLocal()
    try:
        if not needs_refresh(db, max_age_hours):
            return
        changes = apply_quotes(db, fetch_quotes(configured_currencies()), keep_manual=True)
        if changes:
            from app.admin.audit import record
            record(db, None, "fx_rates", "refresh", summary=f"Automatic refresh: {', '.join(sorted(changes))}",
                   after={k: v["after"] for k, v in changes.items()})
        db.commit()
        log.info("FX auto-refresh updated %s", ", ".join(sorted(changes)) or "nothing")
    except FxProviderError as exc:
        db.rollback()
        log.warning("FX auto-refresh skipped: %s", exc)
    except Exception:
        db.rollback()
        log.exception("FX auto-refresh failed")
    finally:
        db.close()


def _loop(interval_hours: float) -> None:
    while not _stop.is_set():
        _refresh_once(interval_hours)
        _stop.wait(interval_hours * 3600)


def start_background_refresh() -> None:
    """Refresh placeholder or old rates now, then every FX_REFRESH_HOURS (default 6). FX_AUTO_REFRESH=0 turns it off."""
    global _thread
    if os.getenv("FX_AUTO_REFRESH", "1").strip().lower() in ("0", "false", "no", "off"):
        return
    if _thread and _thread.is_alive():
        return
    try:
        hours = max(0.25, float(os.getenv("FX_REFRESH_HOURS", "6")))  # never a tight loop against the provider
    except ValueError:
        hours = 6.0
    _stop.clear()
    _thread = threading.Thread(target=_loop, args=(hours,), name="fx-refresh", daemon=True)
    _thread.start()


def stop_background_refresh() -> None:
    _stop.set()
