import requests
import json

def test_multi_calculation():
    url = "http://localhost:8000/api/v1/calculate/multi"
    
    # Sample payload containing multiple line items sharing freight & insurance
    payload = {
        "items": [
            {
                "item_id": "ITEM-001",
                "hs_code": "8517.12",
                "fob_value_fc": 2500.0,
                "currency": "USD",
                "origin_country": "US"
            },
            {
                "item_id": "ITEM-002",
                "hs_code": "6204.62",
                "fob_value_fc": 1200.0,
                "currency": "EUR",
                "origin_country": "EU"
            }
        ],
        "total_freight_insurance_ngn": 650000.0,
        "regime": "legacy",
        "etls_applicable": True
    }

    print("🚀 Sending multi-item calculation request to PortWise API...")
    try:
        response = requests.post(url, json=payload)
        
        print(f"Status Code: {response.status_code}")
        print("Response JSON:")
        print(json.dumps(response.json(), indent=2))
        
    except requests.exceptions.ConnectionError:
        print("❌ Error: Could not connect to the server. Make sure Uvicorn is running!")

if __name__ == "__main__":
    test_multi_calculation()