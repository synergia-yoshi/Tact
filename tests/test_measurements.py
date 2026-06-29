from fastapi.testclient import TestClient

from app.main import create_app


def test_measurement_latest_requires_refresh() -> None:
    client = TestClient(create_app())
    proposal_response = client.post(
        "/api/v1/campaigns/proposals",
        json={
            "name": "Measurement Launch",
            "objective": "conversion",
            "target_audience": "growth teams",
            "total_budget_jpy": 120000,
            "channels": ["search"],
        },
    )
    campaign_id = proposal_response.json()["id"]

    latest_response = client.get(f"/api/v1/campaigns/{campaign_id}/measurements/latest")

    assert latest_response.status_code == 404
    assert latest_response.json()["detail"] == "Measurement snapshot not found"

    refresh_response = client.post(f"/api/v1/campaigns/{campaign_id}/measurements/refresh")

    assert refresh_response.status_code == 200
    snapshot = refresh_response.json()
    assert snapshot["sessions"] > 0
    assert snapshot["conversions"] > 0
    assert snapshot["orders"] > 0
    assert snapshot["revenue_jpy"] > 0
    assert snapshot["ad_spend_jpy"] > 0
    assert snapshot["confidence"] == 0.62

    latest_response = client.get(f"/api/v1/campaigns/{campaign_id}/measurements/latest")

    assert latest_response.status_code == 200
    assert latest_response.json()["id"] == snapshot["id"]
