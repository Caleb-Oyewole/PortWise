from datetime import datetime
from app.database import SessionLocal, engine, Base
from app.models import HSCodeTariff, FXRate

def seed_database():
    # Automatically create database tables if using SQLite / local dev
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        print("🌱 Starting PortWise database seeding...")

        existing_count = db.query(HSCodeTariff).count()
        if existing_count > 0:
            print("ℹ️ Tariff data already exists. Skipping seed.")
            return

        tariffs = [
            HSCodeTariff(
                code="8517.12",
                description="Smartphones and telecommunication devices",
                duty_rate_pct=20.0,
                iat_rate_pct=0.0,
                prohibited=False,
                source_ref="NTIP CET 2026",
                hs_version="2022"
            ),
            HSCodeTariff(
                code="8437.10",
                description="Agricultural and industrial machinery (Zero duty)",
                duty_rate_pct=0.0,
                iat_rate_pct=0.0,
                prohibited=False,
                source_ref="2026 FPM Circular",
                hs_version="2022"
            ),
            HSCodeTariff(
                code="6204.62",
                description="Textiles and cotton garments",
                duty_rate_pct=20.0,
                iat_rate_pct=0.0,
                prohibited=False,
                source_ref="NTIP CET 2026",
                hs_version="2022"
            ),
            HSCodeTariff(
                code="3304.99",
                description="Cosmetics and beauty preparations",
                duty_rate_pct=20.0,
                iat_rate_pct=5.0,
                prohibited=False,
                source_ref="NTIP CET 2026",
                hs_version="2022"
            ),
            HSCodeTariff(
                code="PROHIBITED.01",
                description="Restricted/Banned food items from non-ECOWAS regions",
                duty_rate_pct=35.0,
                iat_rate_pct=0.0,
                prohibited=True,
                source_ref="April 2026 Fiscal Policy Circular",
                hs_version="2022"
            )
        ]

        db.add_all(tariffs)

        fx_rates = [
            FXRate(currency="USD", rate_to_ngn=1550.0, source="CBN Official", is_manual=False),
            FXRate(currency="EUR", rate_to_ngn=1680.5, source="CBN Official", is_manual=False),
            FXRate(currency="GBP", rate_to_ngn=2010.0, source="CBN Official", is_manual=False),
        ]

        db.add_all(fx_rates)
        db.commit()
        print("✅ Database seeding completed successfully!")

    except Exception as e:
        db.rollback()
        print(f"❌ Error seeding database: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()