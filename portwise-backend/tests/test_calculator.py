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
    assert result["vat_amount_ngn"] == 320793.75
    assert result["total_landed_cost_ngn"] == 4598043.75

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
    assert lines["FOB Charge"] == 120000.0
    assert "CISS" not in lines and "Surcharge" not in lines
    assert r["total_charges_ngn"] == 1148043.75


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
