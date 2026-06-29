import pytest
from pydantic import ValidationError

from app.config import Settings


def test_public_status_exposes_storage_backend_without_secret_fields() -> None:
    settings = Settings(
        STORAGE_BACKEND="firestore",
        GCP_PROJECT_ID="tact-prod",
        MEDIA_API_KEY="sm://projects/tact-prod/secrets/media-api-key/versions/latest",
    )

    status = settings.public_status

    assert status["storage_backend"] == "firestore"
    assert "gcp_project_id" not in status
    assert "media_api_key" not in status


def test_local_env_allows_disabled_auth_for_development() -> None:
    settings = Settings(APP_ENV="local", AUTH_MODE="disabled")

    assert settings.auth_mode == "disabled"


def test_production_env_rejects_disabled_auth() -> None:
    with pytest.raises(ValidationError, match="AUTH_MODE=disabled"):
        Settings(APP_ENV="production", AUTH_MODE="disabled")
