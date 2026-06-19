from fastapi.testclient import TestClient

from app.main import create_app


def test_create_and_get_campaign_proposal() -> None:
    client = TestClient(create_app())
    request = {
        "name": "June Launch",
        "objective": "lead_generation",
        "target_audience": "B2B SaaS operators in Japan",
        "total_budget_jpy": 300000,
        "channels": ["search", "social", "display"],
        "kpis": ["qualified_leads", "cost_per_lead"],
        "tone": "confident and concise",
    }

    create_response = client.post("/api/v1/campaigns/proposals", json=request)

    assert create_response.status_code == 201
    proposal = create_response.json()
    assert proposal["id"].startswith("cmp_")
    assert proposal["status"] == "proposed"
    assert proposal["brief"]["name"] == "June Launch"
    assert proposal["creative"]["headline"] == "Tact MVP Campaign"
    assert proposal["creative"]["hashtags"] == ["#search", "#social", "#display"]
    assert len(proposal["media_plan"]["placements"]) == 3
    assert (
        sum(placement["budget_jpy"] for placement in proposal["media_plan"]["placements"])
        == 300000
    )

    get_response = client.get(f"/api/v1/campaigns/{proposal['id']}")

    assert get_response.status_code == 200
    assert get_response.json()["id"] == proposal["id"]


def test_campaign_brief_rejects_invalid_date_range() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/campaigns/proposals",
        json={
            "name": "Invalid Dates",
            "objective": "awareness",
            "target_audience": "marketers",
            "total_budget_jpy": 10000,
            "channels": ["social"],
            "start_date": "2026-06-20",
            "end_date": "2026-06-19",
        },
    )

    assert response.status_code == 422


def test_get_unknown_campaign_returns_404() -> None:
    client = TestClient(create_app())

    response = client.get("/api/v1/campaigns/cmp_missing")

    assert response.status_code == 404
