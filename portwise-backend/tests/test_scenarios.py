"""Independent check of the calculator against a Fraction-based oracle.

The oracle uses exact rational arithmetic and rounds half-up to kobo at the same
points the spec does, so it shares no code with app.calculator.
"""
from fractions import Fraction as F
from decimal import Decimal

import pytest

from app.calculator import compute_breakdown


def half_up(x: F) -> F:
    kobo = x * 100
    n = kobo.numerator // kobo.denominator
    rem = kobo - n
    if rem >= F(1, 2):
        n += 1
    return F(n, 100)


def oracle(fob, freight, duty_pct, regime, etls):
    fob, freight, duty_pct = F(str(fob)), F(str(freight)), F(str(duty_pct))
    cif = fob + freight
    duty = half_up(cif * duty_pct / 100)
    levies = F(0)
    if regime == "legacy":
        levies += half_up(duty * 7 / 100) + half_up(fob * 1 / 100)
    else:  # fob4: the 4% FOB charge replaces CISS; the surcharge still applies (NSW)
        levies += half_up(duty * 7 / 100) + half_up(fob * 4 / 100)
    if etls:
        levies += half_up(cif * F(1, 2) / 100)
    vat = half_up((cif + duty + levies) * F("7.5") / 100)
    return {"duty": duty, "levies": levies, "vat": vat, "total": cif + duty + levies + vat}


CASES = [
    (3000000, 450000, 20, "legacy", True),
    (3000000, 450000, 20, "fob4", True),
    (1000000, 0, 0, "legacy", True),
    (1000000, 0, 0, "fob4", False),
    (123456.78, 9876.54, 5, "legacy", True),
    (123456.78, 9876.54, 5, "fob4", True),
    (99.99, 0.01, 35, "legacy", False),
    (0.03, 0, 10, "fob4", True),
    (7777777.77, 333333.33, 10, "legacy", True),
    (7777777.77, 333333.33, 10, "fob4", False),
    (1550000.55, 155000.05, 20, "legacy", True),
    (50000000, 5000000, 20, "fob4", True),
]


@pytest.mark.parametrize("fob,freight,duty,regime,etls", CASES)
def test_matches_oracle(fob, freight, duty, regime, etls):
    got = compute_breakdown(Decimal(str(fob)), Decimal(str(freight)), Decimal(str(duty)), regime, etls)
    want = oracle(fob, freight, duty, regime, etls)
    assert F(got["duty_amount_ngn"]) == want["duty"]
    assert F(got["total_levies_ngn"]) == want["levies"]
    assert F(got["vat_amount_ngn"]) == want["vat"]
    assert F(got["total_landed_cost_ngn"]) == want["total"]
    # the displayed lines must add up
    assert got["total_landed_cost_ngn"] == (
        got["cif_value_ngn"] + got["duty_amount_ngn"] + got["total_levies_ngn"] + got["vat_amount_ngn"]
    )
