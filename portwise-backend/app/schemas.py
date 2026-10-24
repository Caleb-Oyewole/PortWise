from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

MAX_MONEY = Decimal("1000000000000")  # 1 trillion; guards against absurd inputs
MAX_SHIFTS = 9
MAX_QUANTITY = 10_000_000

RegimeChoice = Literal["legacy", "fob4", "both"]


def _clean_text(value):
    return value.strip() if isinstance(value, str) else value


def _lower(value):
    return value.strip().lower() if isinstance(value, str) else value


def _upper(value):
    return value.strip().upper() if isinstance(value, str) else value


def _check_shifts(values: Optional[List[Decimal]]) -> Optional[List[Decimal]]:
    if values is None:
        return values
    for shift in values:
        if not (Decimal("-50") <= shift <= Decimal("100")):
            raise ValueError("each sensitivity shift must be between -50 and 100 (percent)")
    return values


class CalculateRequest(BaseModel):
    hs_code: str = Field(..., min_length=1, max_length=20, description="HS code, e.g. 8517.12 (dots optional)")
    fob_value: Decimal = Field(..., gt=0, le=MAX_MONEY, description="Free on Board value in `currency`")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="ISO currency code")
    freight_insurance: Optional[Decimal] = Field(
        default=None, ge=0, le=MAX_MONEY,
        description="Freight and insurance in NGN. Omit to use the assumed default percentage of FOB "
                    "(flagged in `assumptions`); send 0 to say there is none.",
    )
    regime: Optional[RegimeChoice] = Field(
        default=None,
        description="'legacy' (1% CISS + 7% surcharge), 'fob4' (4% FOB charge) or 'both'. "
                    "Omit to use the admin-configured default.",
    )
    etls_applicable: bool = Field(default=True, description="Apply the 0.5% ETLS levy")
    origin_country: str = Field(default="US", description="ISO country code, or 'ECOWAS'")
    fx_rate_override: Optional[Decimal] = Field(default=None, gt=0, le=MAX_MONEY, description="Custom NGN rate for `currency`")
    sensitivity_shifts_pct: Optional[List[Decimal]] = Field(
        default=None, max_length=MAX_SHIFTS,
        description="Naira moves to test, in percent. Default [-5, 0, 5, 10].",
    )
    quantity: Optional[int] = Field(
        default=None, ge=1, le=MAX_QUANTITY,
        description="Units covered by `fob_value`. Only used to report `per_unit_landed_cost_ngn`.",
    )

    _v_regime = field_validator("regime", mode="before")(_lower)
    _v_currency = field_validator("currency", mode="before")(_upper)
    _v_hs = field_validator("hs_code", mode="before")(_clean_text)
    _v_shifts = field_validator("sensitivity_shifts_pct")(_check_shifts)


class LineItem(BaseModel):
    item_id: str = Field(..., min_length=1, description="Unique identifier or SKU for the line item")
    hs_code: str = Field(..., min_length=1, max_length=20, description="HS code for tariff lookup")
    fob_value_fc: Decimal = Field(..., gt=0, le=MAX_MONEY, description="Free on Board value in foreign currency")
    currency: str = Field(default="USD", min_length=3, max_length=3, description="ISO currency code")
    origin_country: str = Field(default="US", description="ISO country code, or 'ECOWAS'")
    quantity: Optional[int] = Field(
        default=None, ge=1, le=MAX_QUANTITY,
        description="Units covered by `fob_value_fc`. Only used to report `per_unit_landed_cost_ngn`.",
    )

    _v_currency = field_validator("currency", mode="before")(_upper)
    _v_hs = field_validator("hs_code", mode="before")(_clean_text)


class MultiCalculateRequest(BaseModel):
    items: List[LineItem] = Field(..., min_length=1, description="Lines in the shipment")
    total_freight_insurance_ngn: Optional[Decimal] = Field(
        default=None, ge=0, le=MAX_MONEY,
        description="Total shared freight and insurance in NGN. Omit to use the assumed default "
                    "percentage of FOB (flagged in `assumptions`); send 0 to say there is none.",
    )
    regime: Optional[RegimeChoice] = Field(default=None, description="'legacy', 'fob4' or 'both'; omit for the configured default")
    etls_applicable: bool = Field(default=True, description="Apply the 0.5% ETLS levy")
    sensitivity_shifts_pct: Optional[List[Decimal]] = Field(default=None, max_length=MAX_SHIFTS)
    total_freight_insurance: Optional[Decimal] = Field(
        default=None, ge=0, le=MAX_MONEY,
        description="Total shared freight and insurance in `freight_currency`: an alternative to "
                    "`total_freight_insurance_ngn` for importers who are quoted freight in dollars.",
    )
    freight_currency: str = Field(default="NGN", min_length=3, max_length=3,
                                  description="Currency of `total_freight_insurance`")

    _v_regime = field_validator("regime", mode="before")(_lower)
    _v_shifts = field_validator("sensitivity_shifts_pct")(_check_shifts)
    _v_freight_ccy = field_validator("freight_currency", mode="before")(_upper)

    @model_validator(mode="after")
    def _one_freight_field(self):
        if self.total_freight_insurance is not None and self.total_freight_insurance_ngn is not None:
            raise ValueError("send either total_freight_insurance_ngn or total_freight_insurance, not both")
        return self
