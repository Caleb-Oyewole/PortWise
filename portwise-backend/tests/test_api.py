from datetime import datetime, timedelta

from app.models import FXRate, HSCodeTariff, LevyConfigRow

REF = {"hs_code": "8517.12", "fob_value": 3000000, "currency": "NGN", "freight_insurance": 450000}


def post(client, body, path="/api/v1/calculate"):
    return client.post(path, json=body)


def test_root_and_health_are_up(client):
    for path in ("/", "/health"):
        r = client.get(path)
        assert r.status_code == 200
        assert r.json()["status"] == "online"


def test_reference_case_legacy(client):
    r = post(client, {**REF, "regime": "legacy"})
    assert r.status_code == 200
    body = r.json()
    assert body["data"]["vat_amount_ngn"] == 317666.25
    assert body["data"]["total_landed_cost_ngn"] == 4553216.25
    assert body["regime"] == "legacy" and body["primary_regime"] == "legacy"
    assert len(body["scenarios"]) == 1


def test_reference_case_fob4(client):
    body = post(client, {**REF, "regime": "fob4"}).json()
    assert body["data"]["total_landed_cost_ngn"] == 4649966.25


def test_default_regime_shows_both_and_headline_is_higher(client):
    body = post(client, REF).json()
    assert body["regime"] == "both"
    assert [s["regime"] for s in body["scenarios"]] == ["legacy", "fob4"]
    assert body["primary_regime"] == "fob4"
    assert body["data"]["total_landed_cost_ngn"] == 4649966.25
    assert any("Both levy regimes" in a for a in body["assumptions"])


def test_regime_is_case_insensitive(client):
    assert post(client, {**REF, "regime": "LEGACY"}).status_code == 200


def test_invalid_regime_is_422(client):
    assert post(client, {**REF, "regime": "weird"}).status_code == 422


def test_unknown_hs_code_rejected(client):
    r = post(client, {**REF, "hs_code": "9999.99"})
    assert r.status_code == 400
    assert r.json()["code"] == "unknown_hs_code"
    assert r.json()["success"] is False
    assert isinstance(r.json()["detail"], str)


def test_hs_code_without_dot_matches(client):
    assert post(client, {**REF, "hs_code": "851712"}).status_code == 200


def test_unsupported_goods_rejected(client):
    for code in ("8703.23", "2208.30", "2402.20"):
        r = post(client, {**REF, "hs_code": code})
        assert r.status_code == 400 and r.json()["code"] == "unsupported_goods", code


def test_unsupported_currency_rejected(client):
    r = post(client, {**REF, "currency": "JPY"})
    assert r.status_code == 400
    assert r.json()["code"] == "unsupported_currency"
    assert "USD" in r.json()["detail"]


def test_prohibited_blocked_for_non_ecowas(client):
    r = post(client, {**REF, "hs_code": "PROHIBITED.01", "origin_country": "US"})
    assert r.status_code == 400 and r.json()["code"] == "prohibited_item"


def test_prohibited_allowed_from_ecowas_member_with_warning(client):
    r = post(client, {**REF, "hs_code": "PROHIBITED.01", "origin_country": "gh"})
    assert r.status_code == 200
    assert any("prohibition" in w for w in r.json()["warnings"])


def test_non_ecowas_member_still_blocked(client):
    r = post(client, {**REF, "hs_code": "PROHIBITED.01", "origin_country": "ML"})
    assert r.status_code == 400


def test_freight_assumed_when_omitted(client):
    body = post(client, {"hs_code": "8517.12", "fob_value": 1000000, "currency": "NGN", "regime": "legacy"}).json()
    assert body["data"]["cif_value_ngn"] == 1100000.0  # 10% placeholder default
    assert any("not provided" in a for a in body["assumptions"])


def test_explicit_zero_freight_is_honoured(client):
    body = post(client, {"hs_code": "8517.12", "fob_value": 1000000, "currency": "NGN",
                         "regime": "legacy", "freight_insurance": 0}).json()
    assert body["data"]["cif_value_ngn"] == 1000000.0
    assert not any("not provided" in a for a in body["assumptions"])


def test_fx_override(client):
    body = post(client, {"hs_code": "8517.12", "fob_value": 1000, "currency": "USD",
                         "fx_rate_override": 1600, "freight_insurance": 0, "regime": "legacy"}).json()
    assert body["fx"]["source"] == "User Custom Override"
    assert body["fx"]["as_of_date"] == "Custom"
    assert body["data"]["cif_value_ngn"] == 1600000.0


def test_seeded_fx_is_flagged_as_placeholder(client):
    body = post(client, {"hs_code": "8517.12", "fob_value": 1000, "currency": "USD", "freight_insurance": 0}).json()
    assert any("placeholder" in w for w in body["warnings"])


def test_stale_fx_flagged(client, db):
    row = db.query(FXRate).filter(FXRate.currency == "EUR").first()
    row.source = "CBN Official"
    row.is_manual = False
    row.as_of_date = datetime.utcnow() - timedelta(days=14)
    db.commit()
    body = post(client, {"hs_code": "8517.12", "fob_value": 1000, "currency": "EUR", "freight_insurance": 0}).json()
    assert body["fx"]["stale"] is True
    assert any("business days old" in w for w in body["warnings"])


def test_fresh_fx_not_stale(client, db):
    row = db.query(FXRate).filter(FXRate.currency == "GBP").first()
    row.source = "CBN Official"
    row.is_manual = False
    row.as_of_date = datetime.utcnow()
    db.commit()
    body = post(client, {"hs_code": "8517.12", "fob_value": 1000, "currency": "GBP", "freight_insurance": 0}).json()
    assert body["fx"]["stale"] is False
    assert not any("exchange rate" in w for w in body["warnings"])


def test_default_and_custom_sensitivity(client):
    body = post(client, {**REF, "regime": "legacy"}).json()
    assert [s["fx_shift_pct"] for s in body["sensitivity_analysis"]] == [-5, 0, 5, 10]
    body = post(client, {**REF, "regime": "legacy", "sensitivity_shifts_pct": [-10, 20]}).json()
    assert [s["fx_shift_pct"] for s in body["sensitivity_analysis"]] == [-10, 20]
    assert post(client, {**REF, "sensitivity_shifts_pct": [500]}).status_code == 422


def test_sensitivity_zero_shift_matches_headline(client):
    body = post(client, {**REF, "regime": "legacy"}).json()
    zero = next(s for s in body["sensitivity_analysis"] if s["fx_shift_pct"] == 0)
    assert zero["total_landed_cost_ngn"] == body["data"]["total_landed_cost_ngn"]


def test_iat_is_its_own_line_for_cosmetics(client):
    body = post(client, {**REF, "hs_code": "3304.99", "regime": "legacy"}).json()
    data = body["data"]
    iat = next(c for c in data["charges"] if c["name"] == "IAT")
    assert iat["rate_pct"] == 5.0
    assert iat["amount_ngn"] == round(data["cif_value_ngn"] * 0.05, 2)
    assert data["iat_amount_ngn"] == iat["amount_ngn"]
    # Added to the total, left out of the VAT base, and no longer a warning.
    assert data["vat_base_ngn"] == round(data["cif_value_ngn"] + data["duty_amount_ngn"] + data["total_levies_ngn"], 2)
    assert data["total_landed_cost_ngn"] == round(
        data["vat_base_ngn"] + data["iat_amount_ngn"] + data["vat_amount_ngn"], 2)
    assert not any("Import Adjustment Tax" in w for w in body["warnings"])
    assert any("Import Adjustment Tax" in a for a in body["assumptions"])


def test_no_iat_line_when_rate_is_zero(client):
    data = post(client, {**REF, "regime": "legacy"}).json()["data"]
    assert data["iat_amount_ngn"] == 0.0
    assert all(c["name"] != "IAT" for c in data["charges"])


def test_ecowas_origin_etls_warning(client):
    body = post(client, {**REF, "origin_country": "GH"}).json()
    assert any("ETLS" in w for w in body["warnings"])
    body = post(client, {**REF, "origin_country": "GH", "etls_applicable": False}).json()
    assert not any("ETLS" in w for w in body["warnings"])


def test_invalid_inputs_422(client):
    assert post(client, {**REF, "fob_value": 0}).status_code == 422
    assert post(client, {**REF, "fob_value": -5}).status_code == 422
    assert post(client, {**REF, "freight_insurance": -1}).status_code == 422
    assert post(client, {**REF, "currency": "US"}).status_code == 422


def test_expired_tariff_rejected(client, db):
    row = db.query(HSCodeTariff).filter(HSCodeTariff.code == "6204.62").first()
    row.effective_to = datetime.utcnow() - timedelta(days=1)
    db.commit()
    r = post(client, {**REF, "hs_code": "6204.62"})
    assert r.status_code == 400 and r.json()["code"] == "no_tariff_in_force"


def test_future_tariff_not_yet_in_force(client, db):
    row = db.query(HSCodeTariff).filter(HSCodeTariff.code == "6204.62").first()
    row.effective_from = datetime.utcnow() + timedelta(days=30)
    db.commit()
    r = post(client, {**REF, "hs_code": "6204.62"})
    assert r.status_code == 400 and r.json()["code"] == "no_tariff_in_force"


def test_latest_effective_tariff_wins(client, db):
    # Tariffs are versioned: a second row for the same code with a later effective_from wins.
    old = db.query(HSCodeTariff).filter(HSCodeTariff.code == "8517.12").first()
    old.effective_from = datetime.utcnow() - timedelta(days=30)
    db.add(HSCodeTariff(code="8517.12", description="new", duty_rate_pct=10.0,
                        effective_from=datetime.utcnow() - timedelta(hours=1),
                        source_ref="NEW", hs_version="2022"))
    db.commit()
    body = post(client, {**REF, "regime": "legacy"}).json()
    assert body["tariff"]["duty_rate_pct"] == 10.0
    assert body["rate_version"].startswith("NEW@")


def test_levy_config_overrides_and_cache(client, db):
    db.add(LevyConfigRow(key="active_regime", value="legacy"))
    db.add(LevyConfigRow(key="etls_pct", value="1"))
    db.commit()
    cfg = client.get("/api/v1/config/regime").json()
    assert cfg["active_regime"] == "legacy"
    assert cfg["config_source"] == "database"
    assert cfg["rates"]["etls_pct"] == 1.0
    assert cfg["cache_ttl_seconds"] == 60
    body = post(client, REF).json()
    assert body["regime"] == "legacy"
    etls = next(c for c in body["data"]["charges"] if c["name"] == "ETLS")
    assert etls["amount_ngn"] == 34500.0


def test_levy_config_ignores_bad_values(client, db):
    db.add(LevyConfigRow(key="active_regime", value="bananas"))
    db.add(LevyConfigRow(key="vat_pct", value="250"))
    db.commit()
    cfg = client.get("/api/v1/config/regime").json()
    assert cfg["active_regime"] == "both"
    assert cfg["rates"]["vat_pct"] == 7.5


def test_config_endpoint_defaults(client):
    cfg = client.get("/api/v1/config/regime").json()
    assert cfg["config_source"] == "defaults"
    assert cfg["active_regime"] == "both"
    assert cfg["rate_versions_in_force"]


# ---------- multi ----------

MULTI = {
    "items": [
        {"item_id": "A", "hs_code": "8517.12", "fob_value_fc": 1000000, "currency": "NGN"},
        {"item_id": "B", "hs_code": "6204.62", "fob_value_fc": 2000000, "currency": "NGN"},
    ],
    "total_freight_insurance_ngn": 450000,
    "regime": "legacy",
}


def test_multi_allocates_freight_proportionally_and_sums(client):
    body = client.post("/api/v1/calculate/multi", json=MULTI).json()
    lines = body["line_items"]
    assert [l["allocated_freight_insurance_ngn"] for l in lines] == [150000.0, 300000.0]
    summary = body["shipment_summary"]
    assert summary["total_freight_insurance_ngn"] == 450000.0
    assert summary["grand_total_landed_cost_ngn"] == round(
        sum(l["breakdown"]["total_landed_cost_ngn"] for l in lines), 2)
    # one combined line with the same total fob/freight gives the same numbers when duty rates match
    single = post(client, {**REF, "regime": "legacy"}).json()["data"]["total_landed_cost_ngn"]
    assert summary["grand_total_landed_cost_ngn"] == single


def test_multi_freight_remainder_goes_to_last_line(client):
    body = client.post("/api/v1/calculate/multi", json={
        "items": [{"item_id": str(i), "hs_code": "8517.12", "fob_value_fc": 100, "currency": "NGN"} for i in range(3)],
        "total_freight_insurance_ngn": 100, "regime": "legacy"}).json()
    shares = [l["allocated_freight_insurance_ngn"] for l in body["line_items"]]
    assert shares == [33.33, 33.33, 33.34]
    assert sum(shares) == 100.0


def test_multi_both_regimes_and_assumed_freight(client):
    body = client.post("/api/v1/calculate/multi", json={**MULTI, "regime": None, "total_freight_insurance_ngn": None}).json()
    assert body["regime"] == "both"
    assert len(body["scenarios"]) == 2
    assert body["shipment_summary"]["total_freight_insurance_ngn"] == 300000.0  # 10% of 3,000,000
    assert any("not provided" in a for a in body["assumptions"])


def test_multi_errors_name_the_item(client):
    bad = {**MULTI, "items": MULTI["items"] + [{"item_id": "Z", "hs_code": "0000.00", "fob_value_fc": 5, "currency": "NGN"}]}
    r = client.post("/api/v1/calculate/multi", json=bad)
    assert r.status_code == 400 and "Item Z" in r.json()["detail"]
    assert r.json()["code"] == "unknown_hs_code"


def test_multi_prohibited_line_blocks_shipment(client):
    bad = {**MULTI, "items": MULTI["items"] + [{"item_id": "P", "hs_code": "PROHIBITED.01", "fob_value_fc": 5, "currency": "NGN"}]}
    r = client.post("/api/v1/calculate/multi", json=bad)
    assert r.status_code == 400 and r.json()["code"] == "prohibited_item"


def test_multi_empty_items_422(client):
    assert client.post("/api/v1/calculate/multi", json={"items": []}).status_code == 422


# ---------- browser access ----------

def test_cors_preflight_allows_browser_clients(client):
    r = client.options(
        "/api/v1/calculate",
        headers={
            "Origin": "https://portwise-web.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert r.status_code == 200
    assert r.headers["access-control-allow-origin"] in ("*", "https://portwise-web.example")


def test_readiness_checks_the_database(client):
    r = client.get("/health/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready" and body["database"] == "sqlite" and body["tariff_rows"] >= 5


def test_database_url_normalisation():
    from app.database import normalize_database_url

    assert normalize_database_url("postgres://u:p@h/db") == "postgresql+psycopg2://u:p@h/db"
    assert normalize_database_url("postgresql://u:p@h/db") == "postgresql+psycopg2://u:p@h/db"
    assert normalize_database_url("postgresql+psycopg2://u:p@h/db") == "postgresql+psycopg2://u:p@h/db"
    assert normalize_database_url("sqlite:///./x.db") == "sqlite:///./x.db"


def test_sqlite_falls_back_to_temp_dir_when_app_folder_is_read_only(monkeypatch):
    import tempfile

    from app import database

    monkeypatch.setattr(database.os, "access", lambda path, mode: False)
    assert database._default_sqlite_url().startswith("sqlite:///" + tempfile.gettempdir())
    monkeypatch.setattr(database.os, "access", lambda path, mode: True)
    assert database._default_sqlite_url() == "sqlite:///./portwise.db"


import pytest


@pytest.mark.parametrize("message,cause", [
    ('could not translate host name "db.internal" to address: Name or service not known', "host_not_found"),
    ('connection to server at "h" failed: FATAL:  password authentication failed for user "u"', "authentication_failed"),
    ('FATAL:  no pg_hba.conf entry for host "1.2.3.4", user "u", database "d", no encryption', "ssl_required"),
    ('connection to server at "h", port 5432 failed: Connection refused', "connection_refused"),
    ('connection to server at "h", port 5432 failed: timeout expired', "timeout"),
    ('FATAL:  database "portwise" does not exist', "database_missing"),
    ('FATAL:  role "u" does not exist', "authentication_failed"),
    ("something nobody has seen before", "unknown"),
])
def test_classify_db_error(message, cause):
    from app.database import DB_FAILURE_HINTS, classify_db_error

    got, hint = classify_db_error(Exception(message))
    assert got == cause
    assert hint == DB_FAILURE_HINTS[cause]
    # the hint is a fixed string and never echoes the driver's message
    for secret in ("db.internal", "1.2.3.4", '"u"', "portwise"):
        assert secret not in hint


def test_readiness_reports_the_cause_without_leaking_details(client, monkeypatch):
    from sqlalchemy.exc import OperationalError
    from app.database import engine

    def boom(*a, **k):
        raise OperationalError("SELECT 1", {}, Exception('FATAL: password authentication failed for user "secretuser" at host db.secret.internal'))

    monkeypatch.setattr(engine, "connect", boom)
    r = client.get("/health/ready")
    assert r.status_code == 503
    body = r.json()
    assert body["cause"] == "authentication_failed"
    assert body["error"] == "OperationalError"
    assert "hint" in body
    assert "secretuser" not in r.text and "db.secret.internal" not in r.text
