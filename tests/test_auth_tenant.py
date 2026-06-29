from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.auth import create_signed_auth_token
from app.config import get_settings
from app.dependencies import (
    get_llm_adapter,
    get_measurement_adapter,
    get_media_adapter,
    get_repository_bundle,
    get_secret_resolver,
)
from app.main import create_app

AUTH_SECRET = "test-auth-secret"


@pytest.fixture
def signed_auth_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("AUTH_MODE", "signed_bearer")
    monkeypatch.setenv("AUTH_TOKEN_SECRET", AUTH_SECRET)
    _clear_dependency_caches()
    yield
    _clear_dependency_caches()


def test_signed_bearer_auth_is_required(signed_auth_env: None) -> None:
    client = TestClient(create_app())

    response = client.get("/api/v1/campaigns")

    assert response.status_code == 401


def test_campaign_access_is_scoped_to_verified_token_org(signed_auth_env: None) -> None:
    client = TestClient(create_app())
    org_a_headers = _headers(actor_id="user-a", org_id="org-a")
    org_b_headers = _headers(actor_id="user-b", org_id="org-b")

    create_response = client.post(
        "/api/v1/campaigns/proposals",
        json={
            "name": "Tenant Launch",
            "objective": "lead_generation",
            "target_audience": "operators",
            "total_budget_jpy": 100000,
            "channels": ["search"],
        },
        headers=org_a_headers,
    )

    assert create_response.status_code == 201
    proposal = create_response.json()
    assert proposal["org_id"] == "org-a"
    assert proposal["created_by"] == "user-a"

    spoofed_headers = {**org_b_headers, "x-tact-org": "org-a"}
    cross_tenant_response = client.get(
        f"/api/v1/campaigns/{proposal['id']}",
        headers=spoofed_headers,
    )

    assert cross_tenant_response.status_code == 404

    org_b_list_response = client.get("/api/v1/campaigns", headers=spoofed_headers)

    assert org_b_list_response.status_code == 200
    assert org_b_list_response.json() == []

    org_a_list_response = client.get("/api/v1/campaigns", headers=org_a_headers)

    assert org_a_list_response.status_code == 200
    assert [campaign["id"] for campaign in org_a_list_response.json()] == [proposal["id"]]


def test_invalid_bearer_token_is_rejected(signed_auth_env: None) -> None:
    client = TestClient(create_app())

    response = client.get(
        "/api/v1/campaigns",
        headers={"Authorization": "Bearer definitely.invalid"},
    )

    assert response.status_code == 401


def _headers(*, actor_id: str, org_id: str) -> dict[str, str]:
    token = create_signed_auth_token(
        secret=AUTH_SECRET,
        actor_id=actor_id,
        org_id=org_id,
    )
    return {"Authorization": f"Bearer {token}"}


def _clear_dependency_caches() -> None:
    get_settings.cache_clear()
    get_repository_bundle.cache_clear()
    get_llm_adapter.cache_clear()
    get_media_adapter.cache_clear()
    get_measurement_adapter.cache_clear()
    get_secret_resolver.cache_clear()
