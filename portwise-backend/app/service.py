"""Request handling: tariff and FX lookup, rule checks, and building responses.

The endpoints in main.py are thin wrappers around ``calculate_single`` and
``calculate_multi``.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.calculator import breakdown_to_json, compute_breakdown, q, to_decimal
from app.config import LevyRates, get_levy_rates
from app.errors import PortWiseError
from app.models import FXRate, HSCodeTariff
from app.rules import is_ecowas_origin, normalize_code, unsupported_reason

HUNDRED = Decimal("100")
DEFAULT_SHIFTS = [Decimal("-5"), Decimal("0"), Decimal("5"), Decimal("10")]
ESTIMATE_NOTE = "Estimate only. The HS classification must be confirmed with a licensed customs agent."


# ---------- small helpers ----------

def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def business_days_between(start: date, end: date) -> int:
    """Weekdays after ``start`` up to and including ``end`` (Nigerian holidays are not modelled)."""
    days = 0
    cursor = start
    while cursor < end:
        cursor += timedelta(days=1)
        if cursor.weekday() < 5:
            days += 1
    return days


def _pct(value: Decimal) -> str:
    return format(value.normalize(), "f")


def _json_pct(value: Decimal):
    return int(value) if value == value.to_integral_value() else float(value)


def allocate(total: Decimal, weights: List[Decimal]) -> List[Decimal]:
    """Split ``total`` across ``weights`` in kobo; the last line takes the rounding remainder."""
    total = q(total)
    if not weights:
        return []
    weight_sum = sum(weights)
    if weight_sum == 0:
        weights, weight_sum = [Decimal(1)] * len(weights), Decimal(len(weights))
    shares = [q(total * w / weight_sum) for w in weights[:-1]]
    shares.append(max(total - sum(shares), Decimal("0")))
    return shares


# ---------- data lookups ----------

@dataclass
class TariffInfo:
    code: str
    description: str
    duty_rate_pct: Decimal
    iat_rate_pct: Decimal
    prohibited: bool
    source_ref: Optional[str]
    hs_version: str
    effective_from: datetime

    @property
    def rate_version(self) -> str:
        return f"{self.source_ref or 'unversioned'}@{self.effective_from:%Y-%m-%d}"

    def as_json(self) -> Dict[str, Any]:
        return {
            "code": self.code,
            "description": self.description,
            "duty_rate_pct": float(self.duty_rate_pct),
            "iat_rate_pct": float(self.iat_rate_pct),
            "prohibited": self.prohibited,
            "source_ref": self.source_ref,
            "hs_version": self.hs_version,
            "effective_from": self.effective_from.strftime("%Y-%m-%d"),
            "rate_version": self.rate_version,
        }


def find_tariff(db: Session, hs_code: str, on: datetime) -> TariffInfo:
    key = normalize_code(hs_code)
    reason = unsupported_reason(key)
    if reason:
        raise PortWiseError("unsupported_goods", f"HS {hs_code}: {reason}.")

    code_expr = func.upper(func.replace(HSCodeTariff.code, ".", ""))
    rows = (
        db.query(HSCodeTariff)
        .filter(code_expr == key)
        .order_by(HSCodeTariff.effective_from.desc())
        .all()
    )
    if not rows:
        raise PortWiseError(
            "unknown_hs_code",
            f"HS code {hs_code} is not in the tariff data yet, so no estimate can be given. "
            "Check the code, or ask the admin to add it.",
        )
    current = [r for r in rows if r.effective_from <= on and (r.effective_to is None or r.effective_to > on)]
    if not current:
        raise PortWiseError(
            "no_tariff_in_force",
            f"HS code {hs_code} has no tariff rate in force on {on:%Y-%m-%d} (expired or not yet effective).",
        )
    row = current[0]
    return TariffInfo(
        code=row.code,
        description=row.description,
        duty_rate_pct=to_decimal(row.duty_rate_pct),
        iat_rate_pct=to_decimal(row.iat_rate_pct or 0),
        prohibited=bool(row.prohibited),
        source_ref=row.source_ref,
        hs_version=row.hs_version,
        effective_from=row.effective_from,
    )


@dataclass
class FxInfo:
    currency: str
    rate: Decimal
    source: str
    as_of: str
    stale: bool = False
    is_manual: bool = False
    placeholder: bool = False
    age_business_days: int = 0

    def as_json(self) -> Dict[str, Any]:
        return {
            "currency": self.currency,
            "rate": float(self.rate),
            "source": self.source,
            "as_of_date": self.as_of,
            "stale": self.stale,
        }


def resolve_fx(
    db: Session, currency: str, rates: LevyRates, now: datetime, override: Optional[Decimal] = None
) -> FxInfo:
    currency = currency.strip().upper()
    if override is not None:
        return FxInfo(currency, to_decimal(override), "User Custom Override", "Custom", is_manual=True)
    if currency == "NGN":
        return FxInfo("NGN", Decimal("1"), "No conversion (NGN)", now.date().isoformat())

    record = db.query(FXRate).filter(FXRate.currency == currency).first()
    if record is None:
        available = sorted(row[0] for row in db.query(FXRate.currency).all())
        listed = ", ".join(available) if available else "none yet"
        raise PortWiseError(
            "unsupported_currency",
            f"No exchange rate is available for {currency}. Available: {listed}. "
            "You can also send fx_rate_override.",
        )
    age = business_days_between(record.as_of_date.date(), now.date())
    return FxInfo(
        currency=currency,
        rate=to_decimal(record.rate_to_ngn),
        source=record.source or "Unknown source",
        as_of=record.as_of_date.strftime("%Y-%m-%d"),
        stale=age > rates.fx_stale_business_days,
        is_manual=bool(record.is_manual),
        placeholder=(record.source or "").upper().startswith("PLACEHOLDER"),
        age_business_days=age,
    )


# ---------- rules, warnings and assumptions ----------

def resolve_regimes(requested: Optional[str], rates: LevyRates) -> Tuple[List[str], str]:
    chosen = requested or rates.active_regime
    if chosen == "both":
        return ["legacy", "fob4"], "both"
    return [chosen], chosen


def resolve_freight(provided: Optional[Decimal], fob_ngn: Decimal, rates: LevyRates) -> Tuple[Decimal, Optional[str]]:
    if provided is not None:
        return q(to_decimal(provided)), None
    assumed = q(fob_ngn * rates.default_freight_insurance_pct / HUNDRED)
    note = (
        f"Freight and insurance were not provided, so {_pct(rates.default_freight_insurance_pct)}% of the FOB "
        f"value (₦{assumed:,.2f}) is assumed. Enter the real amount for a firmer estimate."
    )
    return assumed, note


def check_prohibited(entries: List[Tuple[str, TariffInfo, str]]) -> List[str]:
    """Raise if any entry is prohibited from a non-ECOWAS origin; otherwise return warnings."""
    blocked, warnings = [], []
    for label, tariff, origin in entries:
        if not tariff.prohibited:
            continue
        if is_ecowas_origin(origin):
            warnings.append(f"{label}: HS {tariff.code} is on the import prohibition list but is allowed from ECOWAS origins.")
        else:
            blocked.append(f"{label} (HS {tariff.code}, origin {origin})")
    if blocked:
        raise PortWiseError(
            "prohibited_item",
            "Prohibited from non-ECOWAS origins under the current import prohibition list: "
            + "; ".join(blocked) + ".",
        )
    return warnings


def build_notes(
    rates: LevyRates,
    requested_regime: str,
    tariffs: Dict[str, TariffInfo],
    fx_by_currency: Dict[str, FxInfo],
    etls_applicable: bool,
    any_ecowas_origin: bool,
    freight_note: Optional[str],
) -> Tuple[List[str], List[str]]:
    warnings: List[str] = []
    assumptions: List[str] = []

    if requested_regime == "legacy":
        assumptions.append(
            f"Levy regime LEGACY: {_pct(rates.ciss_pct)}% CISS on FOB plus {_pct(rates.surcharge_pct)}% surcharge on the duty."
        )
    elif requested_regime == "fob4":
        assumptions.append(
            f"Levy regime FOB4: {_pct(rates.fob_charge_pct)}% FOB charge replaces CISS and the surcharge."
        )
    else:
        assumptions.append(
            "Both levy regimes are shown because the status of the 4% FOB charge is unclear. "
            "The headline figure is the higher of the two."
        )
    if freight_note:
        assumptions.append(freight_note)
    if etls_applicable:
        assumptions.append(f"ETLS ({_pct(rates.etls_pct)}% of CIF) is included.")
        if any_ecowas_origin:
            warnings.append(
                "ETLS is charged on ECOWAS-origin goods here, but sources disagree on whether it applies. "
                "Confirm with an agent, or send etls_applicable=false."
            )
    for tariff in tariffs.values():
        if tariff.iat_rate_pct > 0:
            warnings.append(
                f"HS {tariff.code} has an Import Adjustment Tax of {_pct(tariff.iat_rate_pct)}% on record, "
                "but it is not included yet because its calculation basis is unconfirmed. The real cost may be higher."
            )
    for fx in fx_by_currency.values():
        if fx.source == "User Custom Override":
            assumptions.append(f"{fx.currency} converted at your own rate of {fx.rate} NGN.")
            continue
        if fx.placeholder:
            warnings.append(
                f"The {fx.currency} exchange rate is a placeholder value, not a live CBN rate. "
                "Enter your own rate or ask the admin to update it."
            )
        elif fx.stale:
            warnings.append(
                f"The {fx.currency} exchange rate is from {fx.as_of} ({fx.age_business_days} business days old), "
                f"older than the {rates.fx_stale_business_days}-day limit. Refresh it or enter your own rate."
            )
        elif fx.is_manual:
            assumptions.append(f"The {fx.currency} rate was entered manually ({fx.source}, as of {fx.as_of}).")
    assumptions.append(ESTIMATE_NOTE)
    return warnings, assumptions


# ---------- core evaluation ----------

@dataclass
class Line:
    item_id: str
    hs_code: str
    tariff: TariffInfo
    fob_fc: Decimal
    fx: FxInfo
    origin: str


def _evaluate(
    lines: List[Line],
    freight_total: Decimal,
    regimes: List[str],
    rates: LevyRates,
    etls: bool,
    shift_pct: Decimal = Decimal("0"),
) -> Dict[str, Dict[str, Any]]:
    factor = Decimal("1") + shift_pct / HUNDRED
    fobs = [q(line.fob_fc * line.fx.rate * factor) for line in lines]
    shares = allocate(freight_total, fobs)

    results: Dict[str, Dict[str, Any]] = {}
    for regime in regimes:
        line_out: List[Dict[str, Any]] = []
        totals = {k: Decimal("0") for k in ("cif", "duty", "levies", "vat", "grand")}
        for line, fob, share in zip(lines, fobs, shares):
            b = compute_breakdown(fob, share, line.tariff.duty_rate_pct, regime, etls, rates=rates)
            line_out.append({
                "item_id": line.item_id,
                "hs_code": line.hs_code,
                "fob_value_ngn": float(fob),
                "allocated_freight_insurance_ngn": float(share),
                "rate_version": line.tariff.rate_version,
                "breakdown": breakdown_to_json(b),
            })
            totals["cif"] += b["cif_value_ngn"]
            totals["duty"] += b["duty_amount_ngn"]
            totals["levies"] += b["total_levies_ngn"]
            totals["vat"] += b["vat_amount_ngn"]
            totals["grand"] += b["total_landed_cost_ngn"]
        results[regime] = {
            "lines": line_out,
            "summary": {
                "total_fob_ngn": float(sum(fobs)),
                "total_freight_insurance_ngn": float(sum(shares)),
                "total_cif_ngn": float(totals["cif"]),
                "total_duty_ngn": float(totals["duty"]),
                "total_levies_ngn": float(totals["levies"]),
                "total_vat_ngn": float(totals["vat"]),
                "grand_total_landed_cost_ngn": float(totals["grand"]),
            },
        }
    return results


def _primary(results: Dict[str, Dict[str, Any]], regimes: List[str]) -> str:
    """With two scenarios the headline is the higher total (the safer budget figure)."""
    return max(regimes, key=lambda r: results[r]["summary"]["grand_total_landed_cost_ngn"])


def _sensitivity(
    lines: List[Line], freight: Decimal, regime: str, rates: LevyRates, etls: bool, shifts: List[Decimal]
) -> List[Dict[str, Any]]:
    table = []
    for shift in shifts:
        result = _evaluate(lines, freight, [regime], rates, etls, shift)[regime]
        entry: Dict[str, Any] = {
            "fx_shift_pct": _json_pct(shift),
            "total_landed_cost_ngn": result["summary"]["grand_total_landed_cost_ngn"],
        }
        if len(lines) == 1:
            entry["exchange_rate"] = float(q(lines[0].fx.rate * (Decimal("1") + shift / HUNDRED)))
        table.append(entry)
    return table


# ---------- public entry points ----------

def calculate_single(db: Session, payload) -> Dict[str, Any]:
    now = utcnow()
    rates, _ = get_levy_rates(db)
    regimes, requested = resolve_regimes(payload.regime, rates)

    tariff = find_tariff(db, payload.hs_code, now)
    warnings = check_prohibited([("This item", tariff, payload.origin_country)])
    fx = resolve_fx(db, payload.currency, rates, now, payload.fx_rate_override)

    line = Line("item-1", tariff.code, tariff, to_decimal(payload.fob_value), fx, payload.origin_country)
    base_fob = q(line.fob_fc * fx.rate)
    freight, freight_note = resolve_freight(payload.freight_insurance, base_fob, rates)

    results = _evaluate([line], freight, regimes, rates, payload.etls_applicable)
    primary = _primary(results, regimes)
    shifts = payload.sensitivity_shifts_pct or DEFAULT_SHIFTS

    more_warnings, assumptions = build_notes(
        rates, requested, {tariff.code: tariff}, {fx.currency: fx},
        payload.etls_applicable, is_ecowas_origin(payload.origin_country), freight_note,
    )
    return {
        "success": True,
        "rate_version": tariff.rate_version,
        "regime": requested,
        "primary_regime": primary,
        "fx": fx.as_json(),
        "tariff": tariff.as_json(),
        "warnings": warnings + more_warnings,
        "assumptions": assumptions,
        "data": results[primary]["lines"][0]["breakdown"],
        "scenarios": [
            {"regime": r, "data": results[r]["lines"][0]["breakdown"]} for r in regimes
        ],
        "sensitivity_analysis": _sensitivity([line], freight, primary, rates, payload.etls_applicable, shifts),
    }


def calculate_multi(db: Session, payload) -> Dict[str, Any]:
    now = utcnow()
    rates, _ = get_levy_rates(db)
    regimes, requested = resolve_regimes(payload.regime, rates)

    lines: List[Line] = []
    tariffs: Dict[str, TariffInfo] = {}
    fx_by_currency: Dict[str, FxInfo] = {}
    prohibited_entries: List[Tuple[str, TariffInfo, str]] = []

    for item in payload.items:
        try:
            tariff = find_tariff(db, item.hs_code, now)
            if item.currency not in fx_by_currency:
                fx_by_currency[item.currency] = resolve_fx(db, item.currency, rates, now)
        except PortWiseError as exc:
            raise PortWiseError(exc.code, f"Item {item.item_id}: {exc.message}", exc.status_code) from exc
        tariffs[tariff.code] = tariff
        prohibited_entries.append((f"Item {item.item_id}", tariff, item.origin_country))
        lines.append(Line(item.item_id, tariff.code, tariff, to_decimal(item.fob_value_fc),
                          fx_by_currency[item.currency], item.origin_country))

    warnings = check_prohibited(prohibited_entries)

    base_fob = sum((q(line.fob_fc * line.fx.rate) for line in lines), Decimal("0"))
    freight, freight_note = resolve_freight(payload.total_freight_insurance_ngn, base_fob, rates)

    results = _evaluate(lines, freight, regimes, rates, payload.etls_applicable)
    primary = _primary(results, regimes)
    shifts = payload.sensitivity_shifts_pct or DEFAULT_SHIFTS

    more_warnings, assumptions = build_notes(
        rates, requested, tariffs, fx_by_currency, payload.etls_applicable,
        any(is_ecowas_origin(line.origin) for line in lines), freight_note,
    )
    return {
        "success": True,
        "regime": requested,
        "primary_regime": primary,
        "rate_versions": sorted({t.rate_version for t in tariffs.values()}),
        "fx": [fx.as_json() for fx in fx_by_currency.values()],
        "warnings": warnings + more_warnings,
        "assumptions": assumptions,
        "item_count": len(lines),
        "shipment_summary": results[primary]["summary"],
        "line_items": results[primary]["lines"],
        "scenarios": [
            {"regime": r, "shipment_summary": results[r]["summary"], "line_items": results[r]["lines"]}
            for r in regimes
        ],
        "sensitivity_analysis": _sensitivity(lines, freight, primary, rates, payload.etls_applicable, shifts),
    }
