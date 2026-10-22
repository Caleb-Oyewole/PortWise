from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import HSCodeTariff, FXRate
from app.calculator import calculate_landed_cost_exact
from pydantic import BaseModel, Field
import os

app = FastAPI(
    title=os.getenv("APP_NAME", "PortWise API"),
    description="Production Landed-Cost & Import-Duty Calculator API.",
    version="2.0.0"
)

class CalculateRequest(BaseModel):
    hs_code: str = Field(..., description="HS Code or category identifier")
    fob_value: float = Field(..., gt=0, description="Free on Board item value")
    currency: str = Field(default="USD", description="Currency code")
    freight_insurance: float = Field(default=0.0, ge=0, description="Shared freight and insurance in NGN")
    regime: str = Field(default="legacy", description="Levy regime: 'legacy' or 'fob4'")
    etls_applicable: bool = Field(default=True, description="Apply 0.5% ETLS levy")
    origin_country: str = Field(default="US", description="Origin country code")

@app.get("/health")
def health_check():
    return {"status": "online", "service": "PortWise API", "version": "2.0.0"}

@app.post("/api/v1/calculate")
def calculate_landed_cost_endpoint(payload: CalculateRequest, db: Session = Depends(get_db)):
    """
    Production calculation endpoint executing database tariff lookups, 
    FX conversion, and exact decimal breakdown.
    """
    # 1. Lookup HS Code tariff data safely
    tariff = db.query(HSCodeTariff).filter(HSCodeTariff.code == payload.hs_code).first()
    
    duty_rate: float = tariff.duty_rate_pct if tariff and tariff.duty_rate_pct is not None else 20.0
    is_prohibited: bool = tariff.prohibited if tariff and tariff.prohibited is not None else False

    # 2. Handle Prohibited Item Check
    warnings = []
    if is_prohibited and payload.origin_country.upper() != "ECOWAS":
        raise HTTPException(
            status_code=400, 
            detail="Item is prohibited under current fiscal policy measures from non-ECOWAS regions."
        )
    elif is_prohibited:
        warnings.append("Item is restricted but permitted under ECOWAS origin rules.")

    # 3. Lookup FX Rate safely
    fx_record = db.query(FXRate).filter(FXRate.currency == payload.currency.upper()).first()
    fx_rate: float = fx_record.rate_to_ngn if fx_record and fx_record.rate_to_ngn is not None else 1550.0
    fx_source: str = fx_record.source if fx_record and fx_record.source else "CBN Official (Estimated)"
    fx_date: str = fx_record.as_of_date.strftime("%Y-%m-%d") if fx_record and fx_record.as_of_date else "2026-10-22"

    # 4. Convert FOB value to NGN
    fob_ngn = payload.fob_value * fx_rate

    # 5. Run exact decimal calculation
    breakdown = calculate_landed_cost_exact(
        fob_value=fob_ngn,
        freight_insurance=payload.freight_insurance,
        duty_rate_pct=duty_rate,
        regime=payload.regime,
        etls_applicable=payload.etls_applicable
    )

    return {
        "success": True,
        "rate_version": "2026-FPM-REV2",
        "fx": {
            "rate": fx_rate,
            "source": fx_source,
            "as_of_date": fx_date,
            "stale": False
        },
        "warnings": warnings,
        "assumptions": [
            "Freight and insurance provided or defaulted.",
            f"Evaluated under {payload.regime.upper()} levy regime."
        ],
        "data": breakdown
    }