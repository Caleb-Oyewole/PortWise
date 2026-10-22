from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any

def round_currency(value: Decimal) -> float:
    """Helper to round half-up to 2 decimal places and return as float for JSON."""
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

def calculate_landed_cost_exact(
    fob_value: float,
    freight_insurance: float,
    duty_rate_pct: float,
    regime: str = "legacy",  # "legacy" or "fob4"
    etls_applicable: bool = True,
    vat_rate_pct: float = 7.5
) -> Dict[str, Any]:
    """
    Calculates import duty, levies, VAT, and total landed cost using exact Decimal arithmetic.
    """
    fob = Decimal(str(fob_value))
    fi = Decimal(str(freight_insurance))
    duty_rate = Decimal(str(duty_rate_pct)) / Decimal("100")
    vat_rate = Decimal(str(vat_rate_pct)) / Decimal("100")

    # 1. CIF Value
    cif = fob + fi

    # 2. Import Duty
    duty_amount = cif * duty_rate

    # 3. Levies & Surcharges based on Regime
    charges = []
    charges.append({"name": "CIF Value", "base": round_currency(cif), "rate_pct": 0.0, "amount_ngn": round_currency(cif)})
    charges.append({"name": "Import Duty", "base": round_currency(cif), "rate_pct": float(duty_rate_pct), "amount_ngn": round_currency(duty_amount)})

    total_levies = Decimal("0.00")

    if regime.lower() == "legacy":
        # Surcharge (7% of duty)
        surcharge_rate = Decimal("7.0")
        surcharge_amount = duty_amount * (surcharge_rate / Decimal("100"))
        charges.append({"name": "Surcharge", "base": round_currency(duty_amount), "rate_pct": float(surcharge_rate), "amount_ngn": round_currency(surcharge_amount)})
        total_levies += surcharge_amount

        # CISS (1% of FOB)
        ciss_rate = Decimal("1.0")
        ciss_amount = fob * (ciss_rate / Decimal("100"))
        charges.append({"name": "CISS", "base": round_currency(fob), "rate_pct": float(ciss_rate), "amount_ngn": round_currency(ciss_amount)})
        total_levies += ciss_amount

    elif regime.lower() == "fob4":
        # FOB charge (4% of FOB) - replaces CISS & surcharge
        fob_charge_rate = Decimal("4.0")
        fob_charge_amount = fob * (fob_charge_rate / Decimal("100"))
        charges.append({"name": "FOB Charge", "base": round_currency(fob), "rate_pct": float(fob_charge_rate), "amount_ngn": round_currency(fob_charge_amount)})
        total_levies += fob_charge_amount

    # ETLS (0.5% of CIF) - on by default, switchable via config flag
    etls_amount = Decimal("0.00")
    if etls_applicable:
        etls_rate = Decimal("0.5")
        etls_amount = cif * (etls_rate / Decimal("100"))
        charges.append({"name": "ETLS", "base": round_currency(cif), "rate_pct": float(etls_rate), "amount_ngn": round_currency(etls_amount)})
        total_levies += etls_amount

    # 4. VAT Base = CIF + Duty + Levies
    vat_base = cif + duty_amount + total_levies
    vat_amount = vat_base * vat_rate

    total_charges = duty_amount + total_levies + vat_amount
    total_landed_cost = cif + total_charges

    return {
        "regime": regime.lower(),
        "cif_value_ngn": round_currency(cif),
        "duty_amount_ngn": round_currency(duty_amount),
        "total_levies_ngn": round_currency(total_levies),
        "vat_amount_ngn": round_currency(vat_amount),
        "total_landed_cost_ngn": round_currency(total_landed_cost),
        "charges": charges
    }