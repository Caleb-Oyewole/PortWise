from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Float, Boolean, DateTime, Integer, Text, UniqueConstraint
from datetime import datetime
from app.database import Base

class HSCodeTariff(Base):
    """One tariff version for an HS code.

    A rate change is a new row with a later ``effective_from``; the previous row is
    end-dated, so history is kept. Hence (code, effective_from) is unique, not code.
    """
    __tablename__ = "hs_codes"
    __table_args__ = (UniqueConstraint("code", "effective_from", name="uq_hs_codes_code_effective_from"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    # Grouping and search terms for the product picker (e.g. "Phones and electronics", "iphone android").
    category: Mapped[str | None] = mapped_column(String(60), nullable=True)
    keywords: Mapped[str | None] = mapped_column(String(255), nullable=True)
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

class AdminUser(Base):
    """People who can sign in to the admin dashboard. Passwords are PBKDF2-SHA256 hashes."""
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AuditLog(Base):
    """One row per admin change: who, what, and the record before and after (JSON text)."""
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admin_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    entity: Mapped[str] = mapped_column(String(50), nullable=False)   # hs_codes | levy_config | fx_rates
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    action: Mapped[str] = mapped_column(String(20), nullable=False)   # create | update | retire | import | refresh
    summary: Mapped[str | None] = mapped_column(String(255), nullable=True)
    before_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
