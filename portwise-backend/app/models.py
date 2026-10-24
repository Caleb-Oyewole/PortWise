from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Float, Boolean, DateTime, Integer
from datetime import datetime
from app.database import Base

class HSCodeTariff(Base):
    __tablename__ = "hs_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    duty_rate_pct: Mapped[float] = mapped_column(Float, nullable=False)
    iat_rate_pct: Mapped[float] = mapped_column(Float, default=0.0)
    prohibited: Mapped[bool] = mapped_column(Boolean, default=False)
    effective_from: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    source_ref: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hs_version: Mapped[str] = mapped_column(String(20), default="2022")

class LevyConfigRow(Base):
    """Key / value overrides for levy rates and the active levy regime.

    Edited from the admin panel; read by app.config with a short cache.
    """
    __tablename__ = "levy_config"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(64), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class FXRate(Base):
    __tablename__ = "fx_rates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    currency: Mapped[str] = mapped_column(String(3), unique=True, index=True, nullable=False)
    rate_to_ngn: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(100), default="CBN Official")
    as_of_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False)