import base64
import hashlib
import hmac
import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

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


def test_expired_bearer_token_is_rejected(signed_auth_env: None) -> None:
    client = TestClient(create_app())
    headers = _headers(
        actor_id="expired-user",
        org_id="org-a",
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )

    response = client.get("/api/v1/campaigns", headers=headers)

    assert response.status_code == 401


def test_bearer_token_without_exp_is_rejected(signed_auth_env: None) -> None:
    client = TestClient(create_app())
    token = _signed_token_without_exp(actor_id="legacy-user", org_id="org-a")

    response = client.get(
        "/api/v1/campaigns",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_publish_approval_requires_approver_role(signed_auth_env: None) -> None:
    client = TestClient(create_app())
    operator_headers = _headers(actor_id="operator", org_id="org-a", roles=["operator"])
    campaign = _create_ready_to_publish_campaign(client, operator_headers)
    action = campaign["actions"][0]

    denied_response = client.post(
        f"/api/v1/campaigns/{campaign['id']}/actions/{action['id']}/approve",
        headers=operator_headers,
    )

    assert denied_response.status_code == 403

    approver_headers = _headers(actor_id="approver", org_id="org-a", roles=["approver"])
    approved_response = client.post(
        f"/api/v1/campaigns/{campaign['id']}/actions/{action['id']}/approve",
        headers=approver_headers,
    )

    assert approved_response.status_code == 200
    assert approved_response.json()["actions"][0]["approval_status"] == "approved"


def test_audit_verify_requires_admin_role(signed_auth_env: None) -> None:
    client = TestClient(create_app())
    operator_headers = _headers(actor_id="operator", org_id="org-a", roles=["operator"])

    denied_response = client.get("/api/v1/campaigns/audit/verify", headers=operator_headers)

    assert denied_response.status_code == 403

    admin_headers = _headers(actor_id="admin", org_id="org-a", roles=["admin"])
    allowed_response = client.get("/api/v1/campaigns/audit/verify", headers=admin_headers)

    assert allowed_response.status_code == 200
    assert allowed_response.json()["valid"] is True


def _headers(
    *,
    actor_id: str,
    org_id: str,
    roles: list[str] | None = None,
    expires_at: datetime | None = None,
) -> dict[str, str]:
    token = create_signed_auth_token(
        secret=AUTH_SECRET,
        actor_id=actor_id,
        org_id=org_id,
        roles=roles,
        expires_at=expires_at,
    )
    return {"Authorization": f"Bearer {token}"}


def _signed_token_without_exp(*, actor_id: str, org_id: str) -> str:
    payload = {"sub": actor_id, "org_id": org_id, "roles": ["operator"]}
    payload_b64 = base64.urlsafe_b64encode(
        json.dumps(payload, sort_keys=True).encode("utf-8")
    ).decode("ascii").rstrip("=")
    digest = hmac.new(
        AUTH_SECRET.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    signature = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return f"{payload_b64}.{signature}"


def _create_ready_to_publish_campaign(client: TestClient, headers: dict[str, str]) -> dict:
    create_response = client.post(
        "/api/v1/campaigns/proposals",
        json={
            "name": "Role Gate Launch",
            "objective": "conversion",
            "target_audience": "growth teams",
            "total_budget_jpy": 100000,
            "channels": ["search"],
        },
        headers=headers,
    )
    assert create_response.status_code == 201
    campaign_id = create_response.json()["id"]

    measurement_response = client.post(
        f"/api/v1/campaigns/{campaign_id}/measurements/refresh",
        headers=headers,
    )
    assert measurement_response.status_code == 200

    legal_response = client.post(
        f"/api/v1/campaigns/{campaign_id}/legal-checks/run",
        headers=headers,
    )
    assert legal_response.status_code == 200

    publish_response = client.post(f"/api/v1/campaigns/{campaign_id}/publish", headers=headers)
    assert publish_response.status_code == 200
    return publish_response.json()


def _clear_dependency_caches() -> None:
    get_settings.cache_clear()
    get_repository_bundle.cache_clear()
    get_llm_adapter.cache_clear()
    get_media_adapter.cache_clear()
    get_measurement_adapter.cache_clear()
    get_secret_resolver.cache_clear()
