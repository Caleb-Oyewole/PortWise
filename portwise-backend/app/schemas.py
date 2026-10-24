from pydantic import BaseModel, Field
from typing import List, Optional

class CalculateRequest(BaseModel):
    hs_code: str = Field(..., description="HS Code or category identifier")
    fob_value: float = Field(..., gt=0, description="Free on Board item value")
    currency: str = Field(default="USD", description="Currency code")
    freight_insurance: float = Field(default=0.0, ge=0, description="Shared freight and insurance in NGN")
    regime: str = Field(default="legacy", description="Levy regime: 'legacy' or 'fob4'")
    etls_applicable: bool = Field(default=True, description="Apply 0.5% ETLS levy")
    origin_country: str = Field(default="US", description="Origin country code")
    fx_rate_override: Optional[float] = Field(default=None, gt=0, description="Optional custom exchange rate override")

class LineItem(BaseModel):
    item_id: str = Field(..., description="Unique identifier or SKU for the line item")
    hs_code: str = Field(..., description="HS Code for tariff lookup")
    fob_value_fc: float = Field(..., gt=0, description="Free on Board value in foreign currency")
    currency: str = Field(default="USD", description="Currency code (e.g. USD, EUR)")
    origin_country: str = Field(default="US", description="Origin country code")

class MultiCalculateRequest(BaseModel):
    items: List[LineItem] = Field(..., description="List of items in the shipment")
    total_freight_insurance_ngn: float = Field(default=0.0, ge=0, description="Total shared freight and insurance in NGN")
    regime: str = Field(default="legacy", description="Levy regime: 'legacy' or 'fob4'")
    etls_applicable: bool = Field(default=True, description="Apply 0.5% ETLS levy")