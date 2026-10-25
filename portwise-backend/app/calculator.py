"""Landed-cost arithmetic.

Everything is exact ``Decimal`` maths; every charge is rounded half-up to kobo as
it is calculated (PRD B8), and VAT and the totals are built from those rounded
lines, so the numbers shown always add up.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, List, Optional, Union

from app.config import LevyRates

Number = Union[Decimal, int, float, str]

CENT = Decimal("0.01")
HUNDRED = Decimal("100")
SINGLE_REGIMES = ("legacy", "fob4")


def to_decimal(value: Number) -> Decimal:
    """Convert via str() so a float like 0.1 stays 0.1 rather than 0.1000000000000000055."""
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def q(value: Decimal) -> Decimal:
    """Round half-up to 2 decimal places."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def round_currency(value: Number) -> float:
    return float(q(to_decimal(value)))


def normalize_regime(regime: str) -> str:
    cleaned = (regime or "").strip().lower()
    if cleaned not in SINGLE_REGIMES:
        raise ValueError(f"Unknown levy regime {regime!r}; expected one of {SINGLE_REGIMES}")
    return cleaned


def _charge(name: str, base: Decimal, rate_pct: Decimal, amount: Decimal) -> Dict[str, Any]:
    return {"name": name, "base": base, "rate_pct": rate_pct, "amount_ngn": amount}


def compute_breakdown(
    fob_value: Number,
    freight_insurance: Number,
    duty_rate_pct: Number,
    regime: str = "legacy",
    etls_applicable: bool = True,
    vat_rate_pct: Optional[Number] = None,
    rates: Optional[LevyRates] = None,
) -> Dict[str, Any]:
    """Return the full breakdown with ``Decimal`` values (naira)."""
    rates = rates or LevyRates()
    regime = normalize_regime(regime)

    fob = q(to_decimal(fob_value))
    freight = q(to_decimal(freight_insurance))
    duty_rate = to_decimal(duty_rate_pct)
    vat_rate = to_decimal(vat_rate_pct) if vat_rate_pct is not None else rates.vat_pct

    cif = fob + freight
    duty = q(cif * duty_rate / HUNDRED)

    charges: List[Dict[str, Any]] = [
        _charge("CIF Value", cif, Decimal("0"), cif),
        _charge("Import Duty", cif, duty_rate, duty),
    ]
    levies = Decimal("0")

    # Both regimes charge the surcharge on the duty. The legacy regime adds CISS
    # (1% of FOB); the fob4 regime adds the 4% FOB charge (FCS) in place of CISS.
    # This is how the official NSW duty calculator works (checked 25 Oct 2026).
    surcharge = q(duty * rates.surcharge_pct / HUNDRED)
    charges.append(_charge("Surcharge", duty, rates.surcharge_pct, surcharge))
    levies += surcharge
    if regime == "legacy":
        ciss = q(fob * rates.ciss_pct / HUNDRED)
        charges.append(_charge("CISS", fob, rates.ciss_pct, ciss))
        levies += ciss
    else:
        fob_charge = q(fob * rates.fob_charge_pct / HUNDRED)
        charges.append(_charge("FOB Charge", fob, rates.fob_charge_pct, fob_charge))
        levies += fob_charge

    if etls_applicable:
        etls = q(cif * rates.etls_pct / HUNDRED)
        charges.append(_charge("ETLS", cif, rates.etls_pct, etls))
        levies += etls

    vat_base = cif + duty + levies
    vat = q(vat_base * vat_rate / HUNDRED)
    total_charges = duty + levies + vat

    return {
        "regime": regime,
        "cif_value_ngn": cif,
        "duty_amount_ngn": duty,
        "total_levies_ngn": levies,
        "vat_base_ngn": vat_base,
        "vat_rate_pct": vat_rate,
        "vat_amount_ngn": vat,
        "total_charges_ngn": total_charges,
        "total_landed_cost_ngn": cif + total_charges,
        "charges": charges,
    }


def breakdown_to_json(breakdown: Dict[str, Any]) -> Dict[str, Any]:
    """Turn the Decimal breakdown into JSON-friendly floats (exact to kobo)."""
    out: Dict[str, Any] = {}
    for key, value in breakdown.items():
        if key == "charges":
            out[key] = [
                {
                    "name": c["name"],
                    "base": float(c["base"]),
                    "rate_pct": float(c["rate_pct"]),
                    "amount_ngn": float(c["amount_ngn"]),
                }
                for c in value
            ]
        elif isinstance(value, Decimal):
            out[key] = float(value)
        else:
            out[key] = value
    return out


def calculate_landed_cost_exact(
    fob_value: Number,
    freight_insurance: Number,
    duty_rate_pct: Number,
    regime: str = "legacy",
    etls_applicable: bool = True,
    vat_rate_pct: Optional[Number] = None,
    rates: Optional[LevyRates] = None,
) -> Dict[str, Any]:
    """Same signature as before; returns floats. Rates default to ``LevyRates()``."""
    return breakdown_to_json(
        compute_breakdown(
            fob_value, freight_insurance, duty_rate_pct, regime, etls_applicable, vat_rate_pct, rates
        )
    )


# Backward compatibility with the Day 1 signature.
def calculate_landed_cost(
    item_value: float,
    fx_rate: float,
    duty_rate_pct: float,
    category_levy_rate_pct: float = 0.0,
    freight_ngn: float = 0.0,
    insurance_ngn: float = 0.0,
    vat_rate_pct: float = 7.5,
) -> Dict[str, Any]:
    fob = to_decimal(item_value) * to_decimal(fx_rate)
    return calculate_landed_cost_exact(
        fob_value=fob,
        freight_insurance=to_decimal(freight_ngn) + to_decimal(insurance_ngn),
        duty_rate_pct=duty_rate_pct,
        regime="legacy",
        etls_applicable=True,
        vat_rate_pct=vat_rate_pct,
    )
