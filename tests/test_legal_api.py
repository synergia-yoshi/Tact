from fastapi.testclient import TestClient

from app.main import create_app


def test_legal_check_latest_requires_run() -> None:
    client = TestClient(create_app())
    proposal_response = client.post(
        "/api/v1/campaigns/proposals",
        json={
            "name": "Legal Launch",
            "objective": "conversion",
            "target_audience": "growth teams",
            "total_budget_jpy": 120000,
            "channels": ["search"],
        },
    )
    campaign_id = proposal_response.json()["id"]

    latest_response = client.get(f"/api/v1/campaigns/{campaign_id}/legal-checks/latest")

    assert latest_response.status_code == 404
    assert latest_response.json()["detail"] == "Legal check not found"

    run_response = client.post(f"/api/v1/campaigns/{campaign_id}/legal-checks/run")

    assert run_response.status_code == 200
    result = run_response.json()
    assert result["status"] == "passed"
    assert result["source"] == "rule_based"

    latest_response = client.get(f"/api/v1/campaigns/{campaign_id}/legal-checks/latest")

    assert latest_response.status_code == 200
    assert latest_response.json()["id"] == result["id"]
