"""Admin API: sign-in, tariff versions, CSV import, levy settings, exchange rates and audit."""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from app.admin.auth import DEV_ADMIN_EMAIL, DEV_ADMIN_PASSWORD, read_token, reset_throttle
from app.fx_provider import Quote


@pytest.fixture()
def auth(client):
    reset_throttle()
    r = client.post("/api/v1/admin/login", json={"email": DEV_ADMIN_EMAIL, "password": DEV_ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_admin_endpoints_need_a_token(client):
    for path in ("/api/v1/admin/me", "/api/v1/admin/tariffs", "/api/v1/admin/levy-config", "/api/v1/admin/fx"):
        r = client.get(path)
        assert r.status_code == 401 and r.json()["code"] == "unauthorized", path
    r = client.get("/api/v1/admin/me", headers={"Authorization": "Bearer forged.token"})
    assert r.status_code == 401


def test_login_rejects_wrong_password_and_throttles(client):
    reset_throttle()
    for _ in range(10):
        r = client.post("/api/v1/admin/login", json={"email": DEV_ADMIN_EMAIL, "password": "nope"})
        assert r.status_code == 401
    r = client.post("/api/v1/admin/login", json={"email": DEV_ADMIN_EMAIL, "password": DEV_ADMIN_PASSWORD})
    assert r.status_code == 429
    reset_throttle()


def test_token_expires(client, auth):
    token = auth["Authorization"].split()[1]
    assert read_token(token) is not None
    assert read_token(token, now=datetime.utcnow().timestamp() + 13 * 3600) is None


def test_add_new_code_then_rate_change_keeps_history(client, auth):
    new = {"code": "8517.13", "description": "Smartphones", "category": "Phones and electronics",
           "keywords": "iphone android", "duty_rate_pct": 10, "source_ref": "CET 8517130000"}
    r = client.post("/api/v1/admin/tariffs", json=new, headers=auth)
    assert r.status_code == 201 and r.json()["status"] == "in_force"
    calc = {"hs_code": "8517.13", "fob_value": 3000000, "currency": "NGN", "freight_insurance": 450000,
            "regime": "legacy"}
    assert client.post("/api/v1/calculate", json=calc).json()["tariff"]["duty_rate_pct"] == 10.0

    later = (datetime.utcnow() + timedelta(hours=1)).isoformat()
    r = client.post("/api/v1/admin/tariffs", json={**new, "duty_rate_pct": 20, "effective_from": later}, headers=auth)
    assert r.status_code == 201 and r.json()["status"] == "scheduled"
    rows = client.get("/api/v1/admin/tariffs?q=8517.13", headers=auth).json()["items"]
    assert len(rows) == 2 and rows[1]["effective_to"] is not None  # the old row is end-dated
    assert client.post("/api/v1/calculate", json=calc).json()["tariff"]["duty_rate_pct"] == 10.0  # not yet

    log = client.get("/api/v1/admin/audit-log?entity=hs_codes", headers=auth).json()
    assert log["total"] == 2 and log["items"][0]["admin_email"] == DEV_ADMIN_EMAIL


def test_duplicate_version_and_unsupported_goods_rejected(client, auth):
    body = {"code": "9999.10", "description": "Test", "duty_rate_pct": 5, "effective_from": "2026-01-01T00:00:00"}
    assert client.post("/api/v1/admin/tariffs", json=body, headers=auth).status_code == 201
    r = client.post("/api/v1/admin/tariffs", json=body, headers=auth)
    assert r.status_code == 400 and r.json()["code"] == "duplicate_version"
    r = client.post("/api/v1/admin/tariffs", json={**body, "code": "8703.23", "effective_from": None}, headers=auth)
    assert r.json()["code"] == "unsupported_goods"


def test_edit_and_retire(client, auth):
    items = client.get("/api/v1/admin/tariffs", headers=auth).json()["items"]
    row = next(t for t in items if t["code"] == "6204.62")
    r = client.patch(f"/api/v1/admin/tariffs/{row['id']}", json={"category": "Textiles and fabric"}, headers=auth)
    assert r.json()["category"] == "Textiles and fabric"
    r = client.post(f"/api/v1/admin/tariffs/{row['id']}/retire", headers=auth)
    assert r.json()["status"] == "retired"
    calc = client.post("/api/v1/calculate", json={"hs_code": "6204.62", "fob_value": 100, "currency": "NGN"})
    assert calc.json()["code"] == "no_tariff_in_force"


def test_csv_import_dry_run_then_commit(client, auth):
    csv = (
        "code,description,category,duty_rate_pct,iat_rate_pct,prohibited,source_ref\n"
        "8471.30,Laptops,Phones and electronics,5,0,no,CET 8471309000\n"
        "8517.12,Smartphones and telecommunication devices,,20,0,no,NTIP CET 2026\n"
        "8482.10,Ball bearings,Machine parts,ten,0,no,x\n"
        "8703.23,Cars,,35,0,no,x\n"
    )
    dry = client.post("/api/v1/admin/tariffs/import", json={"csv": csv, "dry_run": True}, headers=auth).json()
    assert dry["counts"] == {"new_code": 1, "unchanged": 1, "error": 2}
    assert client.get("/api/v1/admin/tariffs?q=8471", headers=auth).json()["items"] == []

    done = client.post("/api/v1/admin/tariffs/import", json={"csv": csv, "dry_run": False}, headers=auth).json()
    assert done["counts"]["new_code"] == 1
    calc = client.post("/api/v1/calculate", json={"hs_code": "8471.30", "fob_value": 10, "currency": "NGN"})
    assert calc.status_code == 200
    bad = client.post("/api/v1/admin/tariffs/import", json={"csv": "foo,bar\n1,2\n"}, headers=auth)
    assert bad.status_code == 400 and bad.json()["code"] == "invalid_csv"


def test_levy_settings_apply_immediately(client, auth):
    r = client.put("/api/v1/admin/levy-config", json={"values": {"active_regime": "legacy", "vat_pct": "10"}},
                   headers=auth)
    settings = {s["key"]: s for s in r.json()["settings"]}
    assert settings["active_regime"]["value"] == "legacy" and settings["vat_pct"]["value"] == 10.0
    body = client.post("/api/v1/calculate", json={"hs_code": "8517.12", "fob_value": 3000000, "currency": "NGN",
                                                  "freight_insurance": 450000}).json()
    assert body["regime"] == "legacy" and body["data"]["vat_rate_pct"] == 10.0

    r = client.put("/api/v1/admin/levy-config", json={"values": {"vat_pct": "250", "active_regime": "x"}},
                   headers=auth)
    assert r.status_code == 400 and r.json()["code"] == "invalid_settings"
    r = client.put("/api/v1/admin/levy-config", json={"values": {"vat_pct": None}}, headers=auth)
    assert {s["key"]: s for s in r.json()["settings"]}["vat_pct"]["value"] == 7.5  # back to the default


def test_manual_fx_rate_clears_placeholder_warning(client, auth):
    r = client.put("/api/v1/admin/fx/usd", json={"rate_to_ngn": 1480.5, "source": "CBN NFEM close"}, headers=auth)
    usd = next(x for x in r.json()["rates"] if x["currency"] == "USD")
    assert usd["rate"] == 1480.5 and usd["placeholder"] is False and usd["is_manual"] is True
    calc = client.post("/api/v1/calculate", json={"hs_code": "8517.12", "fob_value": 100, "currency": "USD"}).json()
    assert calc["fx"]["rate"] == 1480.5
    assert not any("placeholder" in w for w in calc["warnings"])
    assert client.put("/api/v1/admin/fx/NGN", json={"rate_to_ngn": 1}, headers=auth).status_code == 400


def test_fx_refresh_uses_provider(client, auth, monkeypatch):
    now = datetime.utcnow()
    monkeypatch.setattr("app.admin.routes.fetch_quotes",
                        lambda wanted: [Quote("USD", Decimal("1530.25"), now), Quote("CNY", Decimal("212.1"), now)])
    body = client.post("/api/v1/admin/fx/refresh", json={}, headers=auth).json()
    assert body["updated"] == ["CNY", "USD"]
    usd = next(x for x in body["rates"] if x["currency"] == "USD")
    assert usd["rate"] == 1530.25 and usd["placeholder"] is False
    audit = client.get("/api/v1/admin/audit-log?entity=fx_rates", headers=auth).json()
    assert audit["items"][0]["action"] == "refresh"


def test_overview(client, auth):
    body = client.get("/api/v1/admin/overview", headers=auth).json()
    assert body["tariffs"]["in_force"] >= 5
    assert "USD" in body["fx"]["placeholder"]
    assert body["levy"]["active_regime"] == "both"


def test_shipped_catalog_imports_cleanly(client, db):
    from app.admin.routes import run_import
    from app.seed import CATALOG_CSV

    with open(CATALOG_CSV, encoding="utf8") as f:
        report = run_import(db, f.read(), dry_run=False, admin_email="test")
    # 3304.99 and 8437.10 are also in the sample seed, so they arrive as new rate versions.
    assert report["counts"] == {"new_code": 30, "new_rate": 2}
    phones = client.get("/api/v1/hs-codes").json()
    assert {"Phones and electronics", "Vehicle spare parts"} <= {c["name"] for c in phones["categories"]}
    calc = client.post("/api/v1/calculate", json={"hs_code": "8517.13", "fob_value": 3000000,
                                                  "currency": "NGN", "freight_insurance": 450000}).json()
    assert calc["tariff"]["duty_rate_pct"] == 10.0 and calc["tariff"]["source_ref"].startswith("ECOWAS CET")
