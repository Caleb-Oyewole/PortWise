from fastapi import FastAPI
from app.schemas import CalculationRequest, CalculationResponse, CalculationBreakdown
from app.calculator import calculate_landed_cost

app = FastAPI(
    title="PortWise Landed-Cost API",
    description="API Engine for calculating import duties, statutory levies, VAT, and landed costs in Nigeria.",
    version="1.0.0"
)

@app.get("/")
def health_check():
    return {"status": "online", "service": "PortWise Landed-Cost API"}

@app.post("/api/v1/calculate-preview", response_model=CalculationResponse)
def calculate_preview(payload: CalculationRequest):
    """
    Day 1 calculation preview with default CISS (1%) + ETLS (0.5%) statutory levies.
    """
    mock_fx_rate = 1550.0       # 1 USD to NGN
    mock_duty_rate = 20.0       # 20% duty rate
    mock_category_levy = 5.0    # 5% specific category levy
    
    breakdown = calculate_landed_cost(
        item_value=payload.item_value,
        fx_rate=mock_fx_rate,
        duty_rate_pct=mock_duty_rate,
        category_levy_rate_pct=mock_category_levy,
        freight_ngn=payload.cif_freight_ngn,
        insurance_ngn=payload.cif_insurance_ngn
    )
    
    return CalculationResponse(
        success=True,
        data=CalculationBreakdown(
            currency=payload.currency,
            **breakdown
        )
    )