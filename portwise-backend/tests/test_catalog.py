from datetime import datetime, timedelta

from app.models import FXRate, HSCodeTariff


def test_hs_codes_lists_codes_in_force_grouped(client, db):
    db.query(HSCodeTariff).filter(HSCodeTariff.code == "8517.12").update({"category": "Phones and electronics"})
    db.commit()
    body = client.get("/api/v1/hs-codes").json()
    codes = {i["code"] for i in body["items"]}
    assert "8517.12" in codes and body["count"] == len(body["items"])
    phone = next(i for i in body["items"] if i["code"] == "8517.12")
    assert phone["category"] == "Phones and electronics" and phone["duty_rate_pct"] == 20.0
    assert sum(c["count"] for c in body["categories"]) == body["count"]


def test_hs_codes_hide_expired_and_show_newest_version(client, db):
    old = db.query(HSCodeTariff).filter(HSCodeTariff.code == "8517.12").first()
    old.effective_from = datetime.utcnow() - timedelta(days=30)
    db.add(HSCodeTariff(code="8517.12", description="Phones v2", duty_rate_pct=10.0,
                        effective_from=datetime.utcnow() - timedelta(hours=1), hs_version="2022"))
    db.query(HSCodeTariff).filter(HSCodeTariff.code == "6204.62").update(
        {"effective_to": datetime.utcnow() - timedelta(days=1)})
    db.commit()
    items = client.get("/api/v1/hs-codes").json()["items"]
    phones = [i for i in items if i["code"] == "8517.12"]
    assert len(phones) == 1 and phones[0]["duty_rate_pct"] == 10.0
    assert all(i["code"] != "6204.62" for i in items)


def test_fx_lists_rates_with_flags(client):
    body = client.get("/api/v1/fx").json()
    usd = next(r for r in body["rates"] if r["currency"] == "USD")
    assert usd["rate"] == 1550.0 and usd["placeholder"] is True
    assert body["base"] == "NGN"


def test_presets_only_offer_available_products(client, db):
    presets = client.get("/api/v1/presets").json()
    ids = {p["id"] for p in presets}
    assert "phones-dubai" in ids  # falls back to the seeded 8517.12
    phones = next(p for p in presets if p["id"] == "phones-dubai")
    assert phones["items"][0]["hs_code"] == "8517.12"
    assert "fabric-china" not in ids  # no CNY rate seeded
    db.add(FXRate(currency="CNY", rate_to_ngn=210.0, source="test"))
    db.commit()
    assert "fabric-china" in {p["id"] for p in client.get("/api/v1/presets").json()}
