"""Admin API: tariffs, levy and VAT settings, exchange rates, CSV import and the audit log.

Every endpoint except /login needs ``Authorization: Bearer <token>``. Every change
writes an audit row in the same transaction.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.admin import audit
from app.admin.auth import (
    check_login_allowed,
    clear_login_failures,
    issue_token,
    record_login_failure,
    require_admin,
    unauthorized,
    verify_dummy,
    verify_password,
)
from app.config import LevyRates, _apply_rows, clear_rates_cache, get_levy_rates
from app.database import get_db
from app.errors import PortWiseError
from app.fx_provider import FxProviderError, apply_quotes, configured_currencies, fetch_quotes
from app.models import AdminUser, AuditLog, FXRate, HSCodeTariff, LevyConfigRow
from app.rules import normalize_code, unsupported_reason
from app.service import resolve_fx, utcnow

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

LEVY_KEYS = (
    "active_regime", "surcharge_pct", "ciss_pct", "fob_charge_pct", "etls_pct",
    "vat_pct", "default_freight_insurance_pct", "fx_stale_business_days",
)
LEVY_LABELS = {
    "active_regime": "Levy regime shown to users",
    "surcharge_pct": "Customs surcharge (% of duty, legacy regime)",
    "ciss_pct": "CISS (% of FOB, legacy regime)",
    "fob_charge_pct": "FOB charge (% of FOB, 4% regime)",
    "etls_pct": "ETLS (% of CIF)",
    "vat_pct": "VAT (% of CIF + duty + levies)",
    "default_freight_insurance_pct": "Assumed freight and insurance (% of FOB) when none is entered",
    "fx_stale_business_days": "Flag an exchange rate as old after (business days)",
}


def bad_request(code: str, message: str) -> PortWiseError:
    return PortWiseError(code, message, status_code=400)


def not_found(message: str) -> PortWiseError:
    return PortWiseError("not_found", message, status_code=404)


# ---------- auth ----------

class LoginIn(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str = Field(..., min_length=1, max_length=200)


def admin_json(admin: AdminUser) -> Dict[str, Any]:
    return {"id": admin.id, "email": admin.email, "name": admin.name}


@router.post("/login")
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    check_login_allowed(request, email)
    admin = db.query(AdminUser).filter(AdminUser.email == email).first()
    if admin is None:
        verify_dummy(payload.password)  # same work as a real check, so timing does not reveal accounts
    if admin is None or not verify_password(payload.password, admin.password_hash):
        record_login_failure(request, email)
        raise unauthorized("That email and password do not match an admin account.")
    clear_login_failures(email)
    admin.last_login_at = utcnow()
    db.commit()
    return {**issue_token(admin), "admin": admin_json(admin)}


@router.get("/me")
def me(admin: AdminUser = Depends(require_admin)):
    return admin_json(admin)


# ---------- overview ----------

def tariff_status(row: HSCodeTariff, now: datetime) -> str:
    if row.effective_from > now:
        return "scheduled"
    if row.effective_to is not None and row.effective_to <= now:
        return "retired"
    return "in_force"


@router.get("/overview")
def overview(db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    now = utcnow()
    rows = db.query(HSCodeTariff).all()
    in_force = [r for r in rows if tariff_status(r, now) == "in_force"]
    rates, source = get_levy_rates(db)
    fx_rows = [resolve_fx(db, r.currency, rates, now) for r in db.query(FXRate).order_by(FXRate.currency).all()]
    recent = db.query(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(8).all()
    return {
        "tariffs": {
            "in_force": len({normalize_code(r.code) for r in in_force}),
            "versions": len(rows),
            "scheduled": sum(1 for r in rows if tariff_status(r, now) == "scheduled"),
            "categories": len({r.category for r in in_force if r.category}),
            "missing_source": sum(1 for r in in_force if not r.source_ref),
        },
        "fx": {
            "currencies": len(fx_rows),
            "placeholder": [f.currency for f in fx_rows if f.placeholder],
            "stale": [f.currency for f in fx_rows if f.stale and not f.placeholder],
        },
        "levy": {"active_regime": rates.active_regime, "config_source": source},
        "recent_changes": [audit.row_json(r) for r in recent],
    }


# ---------- tariffs ----------

class TariffIn(BaseModel):
    code: str = Field(..., min_length=2, max_length=20)
    description: str = Field(..., min_length=2, max_length=255)
    category: Optional[str] = Field(default=None, max_length=60)
    keywords: Optional[str] = Field(default=None, max_length=255)
    duty_rate_pct: Decimal = Field(..., ge=0, le=100)
    iat_rate_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    prohibited: bool = False
    source_ref: Optional[str] = Field(default=None, max_length=100)
    hs_version: str = Field(default="2022", max_length=20)
    effective_from: Optional[datetime] = None

    @field_validator("code", "description", "category", "keywords", "source_ref", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("code")
    @classmethod
    def _code_chars(cls, v: str) -> str:
        cleaned = v.upper()
        if not all(ch.isalnum() or ch == "." for ch in cleaned):
            raise ValueError("use digits, letters and dots only, e.g. 8517.13")
        return cleaned


class TariffPatch(BaseModel):
    description: Optional[str] = Field(default=None, min_length=2, max_length=255)
    category: Optional[str] = Field(default=None, max_length=60)
    keywords: Optional[str] = Field(default=None, max_length=255)
    duty_rate_pct: Optional[Decimal] = Field(default=None, ge=0, le=100)
    iat_rate_pct: Optional[Decimal] = Field(default=None, ge=0, le=100)
    prohibited: Optional[bool] = None
    source_ref: Optional[str] = Field(default=None, max_length=100)
    hs_version: Optional[str] = Field(default=None, max_length=20)


def tariff_json(row: HSCodeTariff, now: Optional[datetime] = None) -> Dict[str, Any]:
    now = now or utcnow()
    return {
        "id": row.id,
        "code": row.code,
        "description": row.description,
        "category": row.category,
        "keywords": row.keywords,
        "duty_rate_pct": float(row.duty_rate_pct),
        "iat_rate_pct": float(row.iat_rate_pct or 0),
        "prohibited": bool(row.prohibited),
        "source_ref": row.source_ref,
        "hs_version": row.hs_version,
        "effective_from": row.effective_from.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "effective_to": row.effective_to.strftime("%Y-%m-%dT%H:%M:%SZ") if row.effective_to else None,
        "status": tariff_status(row, now),
    }


def _versions(db: Session, code: str) -> List[HSCodeTariff]:
    key = normalize_code(code)
    expr = func.upper(func.replace(HSCodeTariff.code, ".", ""))
    return db.query(HSCodeTariff).filter(expr == key).order_by(HSCodeTariff.effective_from.desc()).all()


def create_version(db: Session, data: TariffIn, admin_email: Optional[str], action: str = "create") -> HSCodeTariff:
    """Add a tariff version. An open-ended earlier version of the same code is end-dated."""
    reason = unsupported_reason(data.code)
    if reason:
        raise bad_request("unsupported_goods", f"HS {data.code}: {reason}.")
    start = data.effective_from or utcnow()
    versions = _versions(db, data.code)
    if any(v.effective_from == start for v in versions):
        raise bad_request("duplicate_version", f"HS {data.code} already has a rate starting {start:%Y-%m-%d %H:%M}.")
    later = [v for v in versions if v.effective_from > start]
    row = HSCodeTariff(
        code=versions[0].code if versions else data.code,  # keep the stored spelling (dots) consistent
        description=data.description,
        category=data.category or (versions[0].category if versions else None),
        keywords=data.keywords if data.keywords is not None else (versions[0].keywords if versions else None),
        duty_rate_pct=float(data.duty_rate_pct),
        iat_rate_pct=float(data.iat_rate_pct),
        prohibited=data.prohibited,
        source_ref=data.source_ref,
        hs_version=data.hs_version,
        effective_from=start,
        effective_to=min(v.effective_from for v in later) if later else None,
    )
    ended = []
    for v in versions:
        if v.effective_from < start and (v.effective_to is None or v.effective_to > start):
            ended.append(tariff_json(v))
            v.effective_to = start
    db.add(row)
    db.flush()
    summary = (f"New rate for HS {row.code}: {data.duty_rate_pct}% duty" if versions
               else f"Added HS {row.code} ({data.description}) at {data.duty_rate_pct}% duty")
    audit.record(db, admin_email, "hs_codes", action, str(row.id), summary,
                 before=ended or None, after=tariff_json(row))
    return row


@router.get("/tariffs")
def list_tariffs(
    q: Optional[str] = Query(default=None, max_length=100),
    status: Optional[str] = Query(default=None, pattern="^(in_force|scheduled|retired)$"),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(require_admin),
):
    now = utcnow()
    rows = db.query(HSCodeTariff).order_by(HSCodeTariff.code, HSCodeTariff.effective_from.desc()).all()
    out = [tariff_json(r, now) for r in rows]
    if status:
        out = [r for r in out if r["status"] == status]
    if q:
        needle = q.strip().lower()
        digits = normalize_code(needle)
        out = [
            r for r in out
            if needle in r["description"].lower()
            or needle in (r["category"] or "").lower()
            or needle in (r["keywords"] or "").lower()
            or (digits and normalize_code(r["code"]).startswith(digits))
        ]
    categories = sorted({r.category for r in rows if r.category})
    return {"items": out, "categories": categories}


@router.post("/tariffs", status_code=201)
def add_tariff(payload: TariffIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    row = create_version(db, payload, admin.email)
    db.commit()
    return tariff_json(row)


@router.patch("/tariffs/{tariff_id}")
def edit_tariff(tariff_id: int, payload: TariffPatch, db: Session = Depends(get_db),
                admin: AdminUser = Depends(require_admin)):
    """Correct a version in place (typos, a wrong rate). To change a rate from a date, add a version."""
    row = db.get(HSCodeTariff, tariff_id)
    if row is None:
        raise not_found("That tariff row no longer exists.")
    before = tariff_json(row)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        if isinstance(value, Decimal):
            value = float(value)
        if isinstance(value, str):
            value = value.strip() or None
            if key == "description" and value is None:
                raise bad_request("invalid_value", "The description cannot be empty.")
        setattr(row, key, value)
    after = tariff_json(row)
    changed = sorted(k for k in changes if before.get(k) != after.get(k))
    if changed:
        audit.record(db, admin.email, "hs_codes", "update", str(row.id),
                     f"Edited HS {row.code}: {', '.join(changed)}", before=before, after=after)
    db.commit()
    return after


@router.post("/tariffs/{tariff_id}/retire")
def retire_tariff(tariff_id: int, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    """End a version now. The row is kept for history; calculations stop using it."""
    row = db.get(HSCodeTariff, tariff_id)
    if row is None:
        raise not_found("That tariff row no longer exists.")
    now = utcnow()
    if tariff_status(row, now) == "retired":
        return tariff_json(row, now)
    before = tariff_json(row, now)
    row.effective_to = max(now, row.effective_from)
    audit.record(db, admin.email, "hs_codes", "retire", str(row.id), f"Retired HS {row.code}",
                 before=before, after=tariff_json(row, now))
    db.commit()
    return tariff_json(row, now)


# ---------- CSV import ----------

CSV_COLUMNS = ("code", "description", "category", "keywords", "duty_rate_pct", "iat_rate_pct",
               "prohibited", "source_ref", "hs_version", "effective_from")
TRUE_WORDS = {"1", "true", "yes", "y"}
FALSE_WORDS = {"", "0", "false", "no", "n"}


class ImportIn(BaseModel):
    csv: str = Field(..., min_length=1, max_length=2_000_000)
    dry_run: bool = True


def _parse_row(raw: Dict[str, str]) -> TariffIn:
    def number(key: str, default: Optional[str] = None) -> Decimal:
        value = (raw.get(key) or default or "").strip().rstrip("%")
        try:
            return Decimal(value)
        except InvalidOperation:
            raise ValueError(f"{key} must be a number")

    prohibited = (raw.get("prohibited") or "").strip().lower()
    if prohibited not in TRUE_WORDS | FALSE_WORDS:
        raise ValueError("prohibited must be yes or no")
    start = (raw.get("effective_from") or "").strip()
    try:
        effective = datetime.fromisoformat(start) if start else None
    except ValueError:
        raise ValueError("effective_from must be a date like 2026-01-31")
    return TariffIn(
        code=raw.get("code") or "",
        description=raw.get("description") or "",
        category=raw.get("category") or None,
        keywords=raw.get("keywords") or None,
        duty_rate_pct=number("duty_rate_pct"),
        iat_rate_pct=number("iat_rate_pct", "0"),
        prohibited=prohibited in TRUE_WORDS,
        source_ref=raw.get("source_ref") or None,
        hs_version=(raw.get("hs_version") or "2022").strip(),
        effective_from=effective,
    )


def _same_as_current(db: Session, data: TariffIn) -> bool:
    now = utcnow()
    current = next((v for v in _versions(db, data.code) if tariff_status(v, now) == "in_force"), None)
    return bool(
        current
        and data.effective_from is None
        and Decimal(str(current.duty_rate_pct)) == data.duty_rate_pct
        and Decimal(str(current.iat_rate_pct or 0)) == data.iat_rate_pct
        and bool(current.prohibited) == data.prohibited
        and current.description == data.description
    )


def run_import(db: Session, text: str, dry_run: bool, admin_email: Optional[str]) -> Dict[str, Any]:
    """Validate a CSV of tariff lines; unless dry_run, add every valid line in one transaction.

    Invalid rows are reported and skipped; valid rows are committed (Backend doc section 13).
    A row identical to the rate already in force is reported as unchanged. Used by the
    admin endpoint, scripts/load_catalog.py and local seeding.
    """
    text = text.lstrip("\ufeff")
    reader = csv.DictReader(io.StringIO(text))
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    missing = [c for c in ("code", "description", "duty_rate_pct") if c not in headers]
    if missing:
        raise bad_request("invalid_csv", f"The CSV needs these columns: {', '.join(missing)}. "
                                         f"Allowed columns: {', '.join(CSV_COLUMNS)}.")
    reader.fieldnames = headers
    results: List[Dict[str, Any]] = []
    seen: set = set()
    added = 0
    for number, raw in enumerate(reader, start=2):  # row 1 is the header
        raw = {k: (v or "") for k, v in raw.items() if k}
        code = (raw.get("code") or "").strip()
        try:
            data = _parse_row(raw)
            key = (normalize_code(data.code), data.effective_from)
            if key in seen:
                raise ValueError("this code and start date appear twice in the file")
            seen.add(key)
            if _same_as_current(db, data):
                results.append({"row": number, "code": data.code, "status": "unchanged"})
                continue
            existing = bool(_versions(db, data.code))
            if dry_run:
                reason = unsupported_reason(data.code)
                if reason:
                    raise ValueError(reason)
            else:
                with db.begin_nested():
                    create_version(db, data, admin_email, action="import")
                added += 1
            results.append({"row": number, "code": data.code, "status": "new_rate" if existing else "new_code",
                            "duty_rate_pct": float(data.duty_rate_pct)})
        except (ValueError, PortWiseError) as exc:
            message = exc.message if isinstance(exc, PortWiseError) else str(exc)
            if hasattr(exc, "errors"):  # pydantic ValidationError
                message = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
            results.append({"row": number, "code": code, "status": "error", "message": message})
    if not dry_run and added:
        audit.record(db, admin_email, "hs_codes", "import", None, f"CSV import: {added} tariff lines added",
                     after={"rows": len(results), "added": added})
        db.commit()
    counts: Dict[str, int] = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    return {"dry_run": dry_run, "counts": counts, "rows": results}


@router.post("/tariffs/import")
def import_tariffs(payload: ImportIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    """Import tariff lines from CSV text (see run_import)."""
    return run_import(db, payload.csv, payload.dry_run, admin.email)


class CatalogIn(BaseModel):
    dry_run: bool = True


@router.post("/tariffs/load-catalog")
def load_catalog(payload: CatalogIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    """Import the sourced tariff catalog shipped with the API (data/tariffs_2026.csv)."""
    from app.seed import CATALOG_CSV

    try:
        with open(CATALOG_CSV, encoding="utf8") as f:
            text = f.read()
    except OSError:
        raise not_found("The bundled tariff catalog is missing from this deployment.")
    return run_import(db, text, payload.dry_run, admin.email)


@router.get("/tariffs/template.csv")
def csv_template(admin: AdminUser = Depends(require_admin)):
    from fastapi.responses import PlainTextResponse
    sample = ",".join(CSV_COLUMNS) + "\n" + \
        '8517.13,Smartphones,Phones and electronics,"phone iphone android",20,0,no,"NCS CET 2022-2026, 8517130000",2022,\n'
    return PlainTextResponse(sample, media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=portwise-tariffs.csv"})


# ---------- levy and VAT settings ----------

def levy_payload(db: Session) -> Dict[str, Any]:
    clear_rates_cache()
    rates, source = get_levy_rates(db)
    defaults = LevyRates().as_json()
    effective = rates.as_json()
    overrides = {r.key: r for r in db.query(LevyConfigRow).all()}
    return {
        "config_source": source,
        "settings": [
            {
                "key": key,
                "label": LEVY_LABELS[key],
                "value": effective[key],
                "default": defaults[key],
                "override": overrides[key].value if key in overrides else None,
                "updated_at": overrides[key].updated_at.strftime("%Y-%m-%dT%H:%M:%SZ") if key in overrides else None,
            }
            for key in LEVY_KEYS
        ],
    }


class LevyIn(BaseModel):
    values: Dict[str, Optional[str]] = Field(..., description="key -> new value, or null to go back to the default")


@router.get("/levy-config")
def get_levy_config(db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    return levy_payload(db)


@router.put("/levy-config")
def put_levy_config(payload: LevyIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    errors: Dict[str, str] = {}
    for key, value in payload.values.items():
        if key not in LEVY_KEYS:
            errors[key] = "Unknown setting."
        elif value is not None:
            _, ok = _apply_rows(LevyRates(), [(key, str(value))])
            if not ok:
                errors[key] = ("Use legacy, fob4 or both." if key == "active_regime"
                               else "Use a whole number from 0 to 30." if key == "fx_stale_business_days"
                               else "Use a percentage from 0 to 100.")
    if errors:
        raise PortWiseError("invalid_settings", "Some settings were not saved: "
                            + "; ".join(f"{k}: {v}" for k, v in errors.items()), 400)
    before = {r.key: r.value for r in db.query(LevyConfigRow).all()}
    for key, value in payload.values.items():
        row = db.get(LevyConfigRow, key)
        if value is None:
            if row:
                db.delete(row)
        else:
            clean = str(value).strip().lower() if key == "active_regime" else str(value).strip()
            if row is None:
                db.add(LevyConfigRow(key=key, value=clean, updated_at=utcnow()))
            elif row.value != clean:
                row.value, row.updated_at = clean, utcnow()
    db.flush()
    after = {r.key: r.value for r in db.query(LevyConfigRow).all()}
    if before != after:
        changed = sorted(k for k in set(before) | set(after) if before.get(k) != after.get(k))
        audit.record(db, admin.email, "levy_config", "update", None,
                     f"Levy settings changed: {', '.join(changed)}", before=before, after=after)
    db.commit()
    return levy_payload(db)


# ---------- exchange rates ----------

class FxIn(BaseModel):
    rate_to_ngn: Decimal = Field(..., gt=0, le=Decimal("10000000"))
    source: Optional[str] = Field(default=None, max_length=100)


class RefreshIn(BaseModel):
    currencies: Optional[List[str]] = None
    keep_manual: bool = False


def fx_payload(db: Session) -> Dict[str, Any]:
    rates, _ = get_levy_rates(db)
    now = utcnow()
    out = []
    for record in db.query(FXRate).order_by(FXRate.currency).all():
        fx = resolve_fx(db, record.currency, rates, now)
        out.append({**fx.as_json(), "placeholder": fx.placeholder, "is_manual": fx.is_manual,
                    "age_business_days": fx.age_business_days})
    return {"rates": out, "provider_currencies": configured_currencies(),
            "stale_after_business_days": rates.fx_stale_business_days}


@router.get("/fx")
def list_fx(db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    return fx_payload(db)


@router.put("/fx/{currency}")
def set_fx(currency: str, payload: FxIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    ccy = currency.strip().upper()
    if len(ccy) != 3 or not ccy.isalpha() or ccy == "NGN":
        raise bad_request("invalid_currency", "Use a three-letter currency code other than NGN, e.g. USD.")
    row = db.query(FXRate).filter(FXRate.currency == ccy).first()
    before = None if row is None else {"rate_to_ngn": row.rate_to_ngn, "source": row.source}
    if row is None:
        row = FXRate(currency=ccy)
        db.add(row)
    row.rate_to_ngn = float(payload.rate_to_ngn)
    row.source = (payload.source or "").strip() or f"Entered by {admin.email}"
    row.as_of_date = utcnow()
    row.is_manual = True
    after = {"rate_to_ngn": row.rate_to_ngn, "source": row.source}
    audit.record(db, admin.email, "fx_rates", "update", ccy, f"Set 1 {ccy} = ₦{payload.rate_to_ngn:,}",
                 before=before, after=after)
    db.commit()
    return fx_payload(db)


@router.post("/fx/refresh")
def refresh_fx(payload: RefreshIn, db: Session = Depends(get_db), admin: AdminUser = Depends(require_admin)):
    wanted = [c.strip().upper() for c in (payload.currencies or configured_currencies())]
    try:
        quotes = fetch_quotes(wanted)
    except FxProviderError as exc:
        raise PortWiseError("fx_provider_unavailable", str(exc), 502)
    changes = apply_quotes(db, quotes, keep_manual=payload.keep_manual)
    if changes:
        audit.record(db, admin.email, "fx_rates", "refresh", None,
                     f"Refreshed from provider: {', '.join(sorted(changes))}",
                     before={k: v["before"] for k, v in changes.items()},
                     after={k: v["after"] for k, v in changes.items()})
    db.commit()
    return {**fx_payload(db), "updated": sorted(changes)}


# ---------- audit log ----------

@router.get("/audit-log")
def audit_log(
    entity: Optional[str] = Query(default=None, pattern="^(hs_codes|levy_config|fx_rates)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(require_admin),
):
    query = db.query(AuditLog)
    if entity:
        query = query.filter(AuditLog.entity == entity)
    total = query.count()
    rows = query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset(offset).limit(limit).all()
    return {"total": total, "items": [audit.row_json(r) for r in rows]}
