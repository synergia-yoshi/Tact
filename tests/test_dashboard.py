from fastapi.testclient import TestClient

from app.main import create_app


def test_dashboard_returns_honest_empty_metrics_before_measurement() -> None:
    client = TestClient(create_app())
    proposal = _create_campaign(client)
    campaign_id = proposal["id"]

    response = client.get(f"/api/v1/campaigns/{campaign_id}/dashboard")

    assert response.status_code == 200
    dashboard = response.json()
    assert dashboard["campaign_id"] == campaign_id
    assert dashboard["period"] == "28d"
    assert dashboard["channel_filter"] == "all"
    assert len(dashboard["channels"]) == 3

    kpis = {metric["key"]: metric for metric in dashboard["kpis"]}
    assert kpis["ad_spend_jpy"]["value"] is None
    assert kpis["ad_spend_jpy"]["status"] == "measurement_pending"
    assert kpis["roas"]["value"] is None
    assert kpis["conversions"]["value"] is None
    assert kpis["cpa_jpy"]["value"] > 0
    assert kpis["cpa_jpy"]["source"] == "media_plan_mock"
    assert kpis["cpa_jpy"]["data_kind"] == "simulated"

    for row in dashboard["channels"]:
        assert row["planned_budget_jpy"]["source"] == "media_plan_mock"
        assert row["planned_budget_jpy"]["value"] > 0
        assert row["ad_spend_jpy"]["value"] is None
        assert row["ad_spend_jpy"]["status"] == "measurement_pending"
        assert row["series"] == []


def test_dashboard_aggregates_channel_metrics_and_keeps_series_gaps() -> None:
    client = TestClient(create_app())
    proposal = _create_campaign(client)
    campaign_id = proposal["id"]
    measurement = client.post(f"/api/v1/campaigns/{campaign_id}/measurements/refresh").json()

    response = client.get(f"/api/v1/campaigns/{campaign_id}/dashboard?period=7d&channel=search")

    assert response.status_code == 200
    dashboard = response.json()
    assert dashboard["period"] == "7d"
    assert dashboard["channel_filter"] == "search"
    assert len(dashboard["channels"]) == 1
    row = dashboard["channels"][0]
    assert row["channel"] == "search"
    assert row["ad_spend_jpy"]["source"] == "ga4_shopify_mock"
    assert row["roas"]["source"] == "ga4_shopify_mock"
    assert row["cpa_jpy"]["source"] == "ga4_shopify_mock"
    assert row["conversions"]["source"] == "ga4_shopify_mock"
    assert row["series"]
    assert any(point["value"] is None for point in row["series"])

    kpis = {metric["key"]: metric for metric in dashboard["kpis"]}
    assert kpis["ad_spend_jpy"]["value"] == row["ad_spend_jpy"]["value"]
    assert kpis["conversions"]["series"] == row["series"]

    all_response = client.get(f"/api/v1/campaigns/{campaign_id}/dashboard?channel=all")
    all_dashboard = all_response.json()
    all_kpis = {metric["key"]: metric for metric in all_dashboard["kpis"]}
    assert all_kpis["ad_spend_jpy"]["value"] == measurement["ad_spend_jpy"]
    assert all_kpis["conversions"]["value"] == measurement["conversions"]
    assert len(all_dashboard["channels"]) == 3


def _create_campaign(client: TestClient) -> dict:
    response = client.post(
        "/api/v1/campaigns/proposals",
        json={
            "name": "Dashboard Launch",
            "objective": "conversion",
            "target_audience": "growth teams",
            "total_budget_jpy": 300000,
            "channels": ["search", "social", "display"],
        },
    )
    assert response.status_code == 201
    return response.json()
