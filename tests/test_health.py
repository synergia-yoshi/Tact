from fastapi.testclient import TestClient

from app.main import create_app


def test_health_does_not_expose_secret_configuration() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["media_adapter"] == "mock"
    assert payload["llm_adapter"] == "mock"
    assert "media_api_key" not in payload
    assert "llm_api_key" not in payload
    assert "media_api_base_url" not in payload
    assert "llm_api_base_url" not in payload
