import pytest
from decimal import Decimal
from app.calculator import calculate_landed_cost_exact

def test_legacy_reference_case():
    """Validates against PRD v2 Section 6 Legacy Reference Case"""
    result = calculate_landed_cost_exact(
        fob_value=3000000.0,
        freight_insurance=450000.0,
        duty_rate_pct=20.0,
        regime="legacy",
        etls_applicable=True
    )
    
    assert result["cif_value_ngn"] == 3450000.0
    assert result["duty_amount_ngn"] == 690000.0
    assert result["vat_amount_ngn"] == 317666.25
    assert result["total_landed_cost_ngn"] == 4553216.25

def test_fob4_reference_case():
    """Validates against PRD v2 Section 6 FOB4 Reference Case"""
    result = calculate_landed_cost_exact(
        fob_value=3000000.0,
        freight_insurance=450000.0,
        duty_rate_pct=20.0,
        regime="fob4",
        etls_applicable=True
    )
    
    assert result["cif_value_ngn"] == 3450000.0
    assert result["duty_amount_ngn"] == 690000.0
    assert result["vat_amount_ngn"] == 324416.25
    assert result["total_landed_cost_ngn"] == 4649966.25

# ---------- extended cases ----------
from app.calculator import compute_breakdown, normalize_regime


def _names(result):
    return {c["name"]: c["amount_ngn"] for c in result["charges"]}


def test_legacy_reference_full_lines():
    r = calculate_landed_cost_exact(3000000, 450000, 20, "legacy", True)
    lines = _names(r)
    assert lines["Surcharge"] == 48300.0      # 7% of 690,000
    assert lines["CISS"] == 30000.0           # 1% of FOB
    assert lines["ETLS"] == 17250.0           # 0.5% of CIF
    assert r["total_levies_ngn"] == 95550.0
    assert r["vat_base_ngn"] == 4235550.0
    assert r["total_charges_ngn"] == 1103216.25


def test_fob4_reference_full_lines():
    r = calculate_landed_cost_exact(3000000, 450000, 20, "fob4", True)
    lines = _names(r)
    assert lines["FOB Charge"] == 120000.0   # 4% of FOB
    assert lines["Surcharge"] == 48300.0     # 7% of 690,000: still applies, as on the NSW calculator
    assert lines["ETLS"] == 17250.0
    assert "CISS" not in lines               # the FOB charge replaces CISS only
    assert r["total_levies_ngn"] == 185550.0
    assert r["total_charges_ngn"] == 1199966.25


def test_matches_nsw_official_calculator():
    """Two runs of the official NSW duty calculator on 25 Oct 2026.

    1,000 USD FOB + 100 USD freight at NSW's rate (CIF NGN 1,497,473.34), phones
    code 9903100004 (5% duty) and a 10% code. NSW rounds VAT and its total
    differently by at most one kobo, so those two are compared with a tolerance.
    """
    fob, freight = Decimal("1361339.40"), Decimal("136133.94")
    five = _names(compute_breakdown(fob, freight, Decimal("5"), "fob4", True))
    assert five["Import Duty"] == Decimal("74873.67")
    assert five["Surcharge"] == Decimal("5241.16")
    assert five["FOB Charge"] == Decimal("54453.58")
    assert five["ETLS"] == Decimal("7487.37")
    r5 = compute_breakdown(fob, freight, Decimal("5"), "fob4", True)
    assert abs(r5["vat_amount_ngn"] - Decimal("122964.68")) <= Decimal("0.01")
    assert abs(r5["total_charges_ngn"] - Decimal("265020.45")) <= Decimal("0.01")

    r10 = compute_breakdown(fob, freight, Decimal("10"), "fob4", True)
    ten = _names(r10)
    assert ten["Import Duty"] == Decimal("149747.33")
    assert ten["Surcharge"] == Decimal("10482.31")
    assert abs(r10["vat_amount_ngn"] - Decimal("128973.29")) <= Decimal("0.01")
    assert abs(r10["total_charges_ngn"] - Decimal("351143.88")) <= Decimal("0.01")


def test_iat_on_the_nsw_case():
    """The NSW phones case (5% duty) with a 5% Import Adjustment Tax on the customs value.

    IAT is its own line and is added to the total, but the VAT base, and so VAT,
    stay exactly as NSW computed them without it.
    """
    fob, freight = Decimal("1361339.40"), Decimal("136133.94")
    plain = compute_breakdown(fob, freight, Decimal("5"), "fob4", True)
    r = compute_breakdown(fob, freight, Decimal("5"), "fob4", True, iat_rate_pct=Decimal("5"))
    lines = _names(r)
    assert lines["IAT"] == Decimal("74873.67")            # 5% of CIF 1,497,473.34
    assert r["iat_amount_ngn"] == Decimal("74873.67")
    assert r["vat_base_ngn"] == plain["vat_base_ngn"]       # not part of the VAT base
    assert r["vat_amount_ngn"] == plain["vat_amount_ngn"]
    assert r["total_charges_ngn"] == plain["total_charges_ngn"] + Decimal("74873.67")
    assert r["total_landed_cost_ngn"] == r["cif_value_ngn"] + r["total_charges_ngn"]
    assert "IAT" not in _names(plain)


def test_zero_duty_still_has_levies_and_vat():
    r = calculate_landed_cost_exact(1000000, 0, 0, "legacy", True)
    assert r["duty_amount_ngn"] == 0.0
    assert _names(r)["CISS"] == 10000.0
    assert r["vat_amount_ngn"] > 0


def test_etls_can_be_switched_off():
    r = calculate_landed_cost_exact(3000000, 450000, 20, "legacy", False)
    assert "ETLS" not in _names(r)


def test_half_up_rounding_to_kobo():
    # 0.5% of 100.10 = 0.5005 -> 0.50 ; 0.5% of 100.30 = 0.5015 -> 0.50 ; 100.50 -> 0.5025 -> 0.50
    # Use a value that lands exactly on a half kobo: duty 0.5% of 3.00 = 0.015 -> 0.02 (half-up)
    b = compute_breakdown(Decimal("3.00"), Decimal("0"), Decimal("0.5"), "fob4", False)
    assert b["duty_amount_ngn"] == Decimal("0.02")


def test_invalid_regime_rejected():
    with pytest.raises(ValueError):
        normalize_regime("nonsense")
    with pytest.raises(ValueError):
        calculate_landed_cost_exact(100, 0, 10, "both")


def test_decimal_inputs_are_not_polluted_by_float_noise():
    r = calculate_landed_cost_exact(0.1, 0.2, 10, "legacy", True)
    assert r["cif_value_ngn"] == 0.3
