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

    audit_response = client.get(f"/api/v1/campaigns/{proposal['id']}/audit")

    assert audit_response.status_code == 200
    audit_entries = audit_response.json()
    assert [entry["event_type"] for entry in audit_entries] == [
        "campaign.proposal.created"
    ]
    assert audit_entries[0]["hash"]


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


def test_campaign_brief_rejects_client_supplied_authority_fields() -> None:
    client = TestClient(create_app())

    response = client.post(
        "/api/v1/campaigns/proposals",
        json={
            "name": "Tamper Attempt",
            "objective": "awareness",
            "target_audience": "marketers",
            "total_budget_jpy": 10000,
            "channels": ["social"],
            "actions": [
                {
                    "kind": "publish_campaign",
                    "approval_status": "approved",
                    "guardrail_result": {"status": "passed"},
                }
            ],
            "audit_entries": [
                {
                    "event_type": "campaign.publish.approved",
                    "guardrail_result": {"status": "passed"},
                }
            ],
        },
    )

    assert response.status_code == 422


def test_get_unknown_campaign_returns_404() -> None:
    client = TestClient(create_app())

    response = client.get("/api/v1/campaigns/cmp_missing")

    assert response.status_code == 404


def test_publish_requires_approval_then_fetches_performance() -> None:
    client = TestClient(create_app())
    proposal_response = client.post(
        "/api/v1/campaigns/proposals",
        json={
            "name": "Performance Launch",
            "objective": "conversion",
            "target_audience": "growth teams",
            "total_budget_jpy": 90000,
            "channels": ["search", "social"],
        },
    )
    campaign_id = proposal_response.json()["id"]

    publish_response = client.post(f"/api/v1/campaigns/{campaign_id}/publish")

    assert publish_response.status_code == 200
    pending = publish_response.json()
    assert pending["status"] == "draft"
    assert pending["publish_result"] is None
    assert len(pending["actions"]) == 1
    action = pending["actions"][0]
    assert action["approval_status"] == "pending_approval"
    assert action["guardrail_result"]["status"] == "requires_approval"

    repeated_publish_response = client.post(f"/api/v1/campaigns/{campaign_id}/publish")

    assert repeated_publish_response.status_code == 200
    assert repeated_publish_response.json()["actions"] == pending["actions"]

    early_performance_response = client.get(f"/api/v1/campaigns/{campaign_id}/performance")

    assert early_performance_response.status_code == 409

    approve_response = client.post(
        f"/api/v1/campaigns/{campaign_id}/actions/{action['id']}/approve"
    )

    assert approve_response.status_code == 200
    published = approve_response.json()
    assert published["status"] == "scheduled"
    assert published["actions"][0]["approval_status"] == "approved"
    assert published["publish_result"]["external_campaign_id"].startswith("mock_media_")
    assert published["publish_result"]["review_url"].startswith("https://mock.media.local/")

    performance_response = client.get(f"/api/v1/campaigns/{campaign_id}/performance")

    assert performance_response.status_code == 200
    performance = performance_response.json()
    external_campaign_id = published["publish_result"]["external_campaign_id"]
    assert performance["external_campaign_id"] == external_campaign_id
    assert performance["impressions"] > 0
    assert performance["clicks"] > 0
    assert performance["conversions"] > 0
    assert performance["spend_jpy"] > 0

    audit_response = client.get(f"/api/v1/campaigns/{campaign_id}/audit")

    assert audit_response.status_code == 200
    assert [entry["event_type"] for entry in audit_response.json()] == [
        "campaign.proposal.created",
        "campaign.publish.requested",
        "campaign.publish.approved",
    ]

    verify_response = client.get("/api/v1/campaigns/audit/verify")

    assert verify_response.status_code == 200
    assert verify_response.json()["valid"] is True


def test_performance_requires_published_campaign() -> None:
    client = TestClient(create_app())
    proposal_response = client.post(
        "/api/v1/campaigns/proposals",
        json={
            "name": "Unpublished Launch",
            "objective": "awareness",
            "target_audience": "founders",
            "total_budget_jpy": 50000,
            "channels": ["display"],
        },
    )
    campaign_id = proposal_response.json()["id"]

    response = client.get(f"/api/v1/campaigns/{campaign_id}/performance")

    assert response.status_code == 409
