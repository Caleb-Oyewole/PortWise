"""Optional calculate inputs: quantity (per-unit cost) and freight quoted in a foreign currency."""


def test_quantity_gives_per_unit_cost(client):
    body = client.post("/api/v1/calculate", json={
        "hs_code": "8517.12", "fob_value": 3000000, "currency": "NGN",
        "freight_insurance": 450000, "regime": "legacy", "quantity": 20}).json()
    assert body["per_unit_landed_cost_ngn"] == round(4553216.25 / 20, 2)


def test_multi_freight_in_foreign_currency_and_line_details(client):
    body = client.post("/api/v1/calculate/multi", json={
        "items": [{"item_id": "A", "hs_code": "8517.12", "fob_value_fc": 1000, "currency": "USD", "quantity": 4}],
        "total_freight_insurance": 100, "freight_currency": "USD", "regime": "legacy"}).json()
    line = body["line_items"][0]
    assert body["shipment_summary"]["total_freight_insurance_ngn"] == 155000.0
    assert line["description"].startswith("Smartphones") and line["quantity"] == 4
    assert line["per_unit_landed_cost_ngn"] == round(line["breakdown"]["total_landed_cost_ngn"] / 4, 2)
    assert any("converted at" in a for a in body["assumptions"])


def test_multi_rejects_both_freight_fields(client):
    r = client.post("/api/v1/calculate/multi", json={
        "items": [{"item_id": "A", "hs_code": "8517.12", "fob_value_fc": 1000, "currency": "USD"}],
        "total_freight_insurance": 100, "total_freight_insurance_ngn": 5})
    assert r.status_code == 422


def test_multi_unit_value_times_quantity_is_exact(client):
    body = client.post("/api/v1/calculate/multi", json={
        "items": [{"item_id": "A", "hs_code": "8517.12", "unit_value": "18.35", "quantity": 1500, "currency": "NGN"}],
        "total_freight_insurance_ngn": 0, "regime": "legacy"}).json()
    assert body["line_items"][0]["fob_value_fc"] == 27525.0


def test_multi_line_needs_a_value(client):
    r = client.post("/api/v1/calculate/multi", json={"items": [{"item_id": "A", "hs_code": "8517.12", "currency": "NGN"}]})
    assert r.status_code == 422
    r = client.post("/api/v1/calculate/multi", json={
        "items": [{"item_id": "A", "hs_code": "8517.12", "currency": "NGN", "unit_value": 5}]})
    assert r.status_code == 422


def test_multi_summary_reports_charges_and_uplift(client):
    body = client.post("/api/v1/calculate/multi", json={
        "items": [{"item_id": "A", "hs_code": "8517.12", "fob_value_fc": 3000000, "currency": "NGN"}],
        "total_freight_insurance_ngn": 450000, "regime": "legacy"}).json()
    s = body["shipment_summary"]
    assert s["total_charges_ngn"] == round(4553216.25 - 3450000, 2)
    assert s["charges_pct_of_fob"] == round((4553216.25 - 3000000) / 3000000 * 100, 2)
