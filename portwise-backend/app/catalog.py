"""Read-only endpoints the web app needs before a calculation: products, rates, examples."""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import get_levy_rates
from app.database import get_db
from app.models import FXRate, HSCodeTariff
from app.rules import normalize_code
from app.service import resolve_fx, utcnow

router = APIRouter(prefix="/api/v1", tags=["catalog"])

OTHER_CATEGORY = "Other goods"


def tariffs_in_force(db: Session) -> List[HSCodeTariff]:
    """The newest row in force for each code (codes compared without dots or case)."""
    now = utcnow()
    rows = (
        db.query(HSCodeTariff)
        .filter(HSCodeTariff.effective_from <= now)
        .filter((HSCodeTariff.effective_to.is_(None)) | (HSCodeTariff.effective_to > now))
        .order_by(HSCodeTariff.effective_from.desc())
        .all()
    )
    seen: Dict[str, HSCodeTariff] = {}
    for row in rows:
        seen.setdefault(normalize_code(row.code), row)
    return sorted(seen.values(), key=lambda r: ((r.category or OTHER_CATEGORY), r.description))


def hs_code_json(row: HSCodeTariff) -> Dict[str, Any]:
    return {
        "code": row.code,
        "description": row.description,
        "category": row.category or OTHER_CATEGORY,
        "keywords": row.keywords or "",
        "duty_rate_pct": float(row.duty_rate_pct),
        "iat_rate_pct": float(row.iat_rate_pct or 0),
        "prohibited": bool(row.prohibited),
        "source_ref": row.source_ref,
        "hs_version": row.hs_version,
        "effective_from": row.effective_from.strftime("%Y-%m-%d"),
    }


@router.get("/hs-codes")
def list_hs_codes(db: Session = Depends(get_db)):
    """Every HS code with a tariff in force today, grouped by category for the product picker."""
    items = [hs_code_json(r) for r in tariffs_in_force(db)]
    categories: List[Dict[str, Any]] = []
    for item in items:
        if not categories or categories[-1]["name"] != item["category"]:
            categories.append({"name": item["category"], "count": 0})
        categories[-1]["count"] += 1
    last_change = db.query(HSCodeTariff.effective_from).order_by(HSCodeTariff.effective_from.desc()).first()
    return {
        "count": len(items),
        "categories": categories,
        "items": items,
        "tariff_updated_at": last_change[0].strftime("%Y-%m-%d") if last_change else None,
    }


@router.get("/fx")
def list_fx_rates(db: Session = Depends(get_db)):
    """Every exchange rate on file, with its source, age and stale / placeholder flags."""
    rates, _ = get_levy_rates(db)
    now = utcnow()
    out = []
    for record in db.query(FXRate).order_by(FXRate.currency).all():
        fx = resolve_fx(db, record.currency, rates, now)
        out.append({
            **fx.as_json(),
            "placeholder": fx.placeholder,
            "is_manual": fx.is_manual,
            "age_business_days": fx.age_business_days,
        })
    return {"base": "NGN", "stale_after_business_days": rates.fx_stale_business_days, "rates": out}


# One-click demo scenarios. Each line lists candidate codes; the first one in force is used, so the
# presets keep working on databases that still hold older sample codes.
PRESETS: List[Dict[str, Any]] = [
    {
        "id": "phones-dubai",
        "label": "Phones from Dubai",
        "description": "20 smartphones at $250 each, $250 freight and insurance",
        "freight": {"amount": 250, "currency": "USD"},
        "items": [{"hs_codes": ["8517.13", "8517.12"], "unit_value": 250, "quantity": 20,
                   "currency": "USD", "origin_country": "AE"}],
    },
    {
        "id": "fabric-china",
        "label": "Fabric from China",
        "description": "1,500 yards of printed cotton at ¥18 a yard",
        "freight": {"amount": 4000, "currency": "CNY"},
        "items": [{"hs_codes": ["5208.52", "6204.62"], "unit_value": 18, "quantity": 1500,
                   "currency": "CNY", "origin_country": "CN"}],
    },
    {
        "id": "parts-germany",
        "label": "Parts from Germany",
        "description": "Ball bearings and water pumps in one shipment",
        "freight": {"amount": 550, "currency": "EUR"},
        "items": [
            {"hs_codes": ["8482.10", "8437.10"], "unit_value": 12, "quantity": 400,
             "currency": "EUR", "origin_country": "DE"},
            {"hs_codes": ["8413.70"], "unit_value": 180, "quantity": 6,
             "currency": "EUR", "origin_country": "DE"},
        ],
    },
]


@router.get("/presets")
def list_presets(db: Session = Depends(get_db)):
    """Demo scenarios whose products and currencies are all available in this database."""
    available = {normalize_code(r.code): r.code for r in tariffs_in_force(db)}
    currencies = {row[0] for row in db.query(FXRate.currency).all()} | {"NGN"}
    out = []
    for preset in PRESETS:
        items = []
        for line in preset["items"]:
            code = next((available[normalize_code(c)] for c in line["hs_codes"] if normalize_code(c) in available), None)
            if code is None or line["currency"] not in currencies:
                items = []
                break
            items.append({k: v for k, v in line.items() if k != "hs_codes"} | {"hs_code": code})
        if items and preset["freight"]["currency"] in currencies:
            out.append({**{k: v for k, v in preset.items() if k != "items"}, "items": items})
    return out
