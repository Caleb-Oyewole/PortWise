from pydantic import BaseModel, Field

class CalculationRequest(BaseModel):
    item_value: float = Field(..., gt=0, description="Value of the item in foreign currency")
    currency: str = Field(default="USD", description="Currency code (e.g., USD, EUR, GBP)")
    category_code: str = Field(..., description="HS Code or category identifier")
    cif_freight_ngn: float = Field(default=0.0, ge=0, description="Optional freight cost in NGN")
    cif_insurance_ngn: float = Field(default=0.0, ge=0, description="Optional insurance cost in NGN")

class LeviesBreakdown(BaseModel):
    ciss_rate_pct: float = 1.0
    ciss_amount_ngn: float
    etls_rate_pct: float = 0.5
    etls_amount_ngn: float
    category_levy_rate_pct: float = 0.0
    category_levy_amount_ngn: float
    total_levy_rate_pct: float
    total_levy_amount_ngn: float

class CalculationBreakdown(BaseModel):
    item_value_original: float
    currency: str
    fx_rate_used: float
    cif_value_ngn: float
    duty_rate_pct: float
    duty_amount_ngn: float
    levies: LeviesBreakdown
    vat_rate_pct: float = 7.5
    vat_amount_ngn: float
    total_landed_cost_ngn: float

class CalculationResponse(BaseModel):
    success: bool
    data: CalculationBreakdown