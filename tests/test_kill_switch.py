from fastapi.testclient import TestClient

from app.main import create_app


def test_kill_switch_latest_requires_evaluation() -> None:
    client = TestClient(create_app())
    proposal = _create_campaign(client)
    campaign_id = proposal["id"]

    latest_response = client.get(f"/api/v1/campaigns/{campaign_id}/kill-switch/latest")

    assert latest_response.status_code == 404
    assert latest_response.json()["detail"] == "Kill Switch result not found"

    evaluate_response = client.post(f"/api/v1/campaigns/{campaign_id}/kill-switch/evaluate")

    assert evaluate_response.status_code == 200
    result = evaluate_response.json()
    assert result["status"] == "clear"
    assert result["data_kind"] == "simulated"
    assert result["media_status"]["external_campaign_id"] is None
    assert "no real stop action" in result["reason"]

    latest_response = client.get(f"/api/v1/campaigns/{campaign_id}/kill-switch/latest")

    assert latest_response.status_code == 200
    assert latest_response.json()["id"] == result["id"]


def test_kill_switch_uses_mock_media_status_after_publish() -> None:
    client = TestClient(create_app())
    proposal = _create_campaign(client)
    campaign_id = proposal["id"]

    client.post(f"/api/v1/campaigns/{campaign_id}/measurements/refresh")
    client.post(f"/api/v1/campaigns/{campaign_id}/legal-checks/run")
    publish_response = client.post(f"/api/v1/campaigns/{campaign_id}/publish")
    action_id = publish_response.json()["actions"][0]["id"]
    approve_response = client.post(
        f"/api/v1/campaigns/{campaign_id}/actions/{action_id}/approve"
    )
    external_campaign_id = approve_response.json()["publish_result"]["external_campaign_id"]

    evaluate_response = client.post(f"/api/v1/campaigns/{campaign_id}/kill-switch/evaluate")

    assert evaluate_response.status_code == 200
    result = evaluate_response.json()
    assert result["status"] == "clear"
    assert result["data_kind"] == "simulated"
    assert result["media_status"]["external_campaign_id"] == external_campaign_id
    assert result["media_status"]["health"] == "healthy"
    assert "no real stop mutation was executed" in result["reason"]


def _create_campaign(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/campaigns/proposals",
        json={
            "name": "Kill Switch Launch",
            "objective": "conversion",
            "target_audience": "growth teams",
            "total_budget_jpy": 120000,
            "channels": ["search"],
        },
    )
    assert response.status_code == 201
    return response.json()
