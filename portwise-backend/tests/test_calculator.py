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