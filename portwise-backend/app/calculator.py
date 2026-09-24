from typing import Dict, Any

def calculate_landed_cost(
    item_value: float,
    fx_rate: float,
    duty_rate_pct: float,
    category_levy_rate_pct: float = 0.0,
    freight_ngn: float = 0.0,
    insurance_ngn: float = 0.0,
    vat_rate_pct: float = 7.5
) -> Dict[str, Any]:
    """
    Calculates import duty, statutory levies (CISS 1%, ETLS 0.5%), category levies,
    VAT, and total landed cost in NGN.
    """
    # 1. Foreign Currency Conversion & CIF Calculation
    item_value_ngn = item_value * fx_rate
    cif_value_ngn = item_value_ngn + freight_ngn + insurance_ngn

    # 2. Duty Calculation
    duty_amount = cif_value_ngn * (duty_rate_pct / 100.0)

    # 3. Statutory & Category Levies
    ciss_rate = 1.0
    etls_rate = 0.5
    total_levy_rate = ciss_rate + etls_rate + category_levy_rate_pct

    ciss_amount = cif_value_ngn * (ciss_rate / 100.0)
    etls_amount = cif_value_ngn * (etls_rate / 100.0)
    category_levy_amount = cif_value_ngn * (category_levy_rate_pct / 100.0)
    total_levy_amount = ciss_amount + etls_amount + category_levy_amount

    # 4. Taxable Base for VAT = CIF + Duty + Levies
    vat_taxable_base = cif_value_ngn + duty_amount + total_levy_amount
    vat_amount = vat_taxable_base * (vat_rate_pct / 100.0)

    # 5. Total Landed Cost
    total_landed_cost = cif_value_ngn + duty_amount + total_levy_amount + vat_amount

    return {
        "item_value_original": round(item_value, 2),
        "fx_rate_used": round(fx_rate, 2),
        "cif_value_ngn": round(cif_value_ngn, 2),
        "duty_rate_pct": round(duty_rate_pct, 2),
        "duty_amount_ngn": round(duty_amount, 2),
        "levies": {
            "ciss_rate_pct": round(ciss_rate, 2),
            "ciss_amount_ngn": round(ciss_amount, 2),
            "etls_rate_pct": round(etls_rate, 2),
            "etls_amount_ngn": round(etls_amount, 2),
            "category_levy_rate_pct": round(category_levy_rate_pct, 2),
            "category_levy_amount_ngn": round(category_levy_amount, 2),
            "total_levy_rate_pct": round(total_levy_rate, 2),
            "total_levy_amount_ngn": round(total_levy_amount, 2),
        },
        "vat_rate_pct": round(vat_rate_pct, 2),
        "vat_amount_ngn": round(vat_amount, 2),
        "total_landed_cost_ngn": round(total_landed_cost, 2),
    }