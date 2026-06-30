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
    with pytest.raises(ValidationError, match="AUTH_MODE=oidc"):
        Settings(APP_ENV="production", AUTH_MODE="disabled")


def test_production_env_rejects_signed_bearer_auth() -> None:
    with pytest.raises(ValidationError, match="AUTH_MODE=oidc"):
        Settings(APP_ENV="production", AUTH_MODE="signed_bearer")


def test_oidc_requires_jwks_settings() -> None:
    with pytest.raises(ValidationError, match="OIDC_ISSUER"):
        Settings(APP_ENV="local", AUTH_MODE="oidc")


def test_production_requires_iap_configuration() -> None:
    with pytest.raises(ValidationError, match="IAP_REQUIRED=true"):
        Settings(
            APP_ENV="production",
            AUTH_MODE="oidc",
            OIDC_ISSUER="https://issuer.example",
            OIDC_AUDIENCE="tact-api",
            OIDC_JWKS_URL="https://issuer.example/.well-known/jwks.json",
        )


def test_production_security_configuration_is_fail_closed_when_complete() -> None:
    settings = Settings(
        APP_ENV="production",
        AUTH_MODE="oidc",
        OIDC_ISSUER="https://issuer.example",
        OIDC_AUDIENCE="tact-api",
        OIDC_JWKS_URL="https://issuer.example/.well-known/jwks.json",
        IAP_REQUIRED="true",
        IAP_ISSUER="https://cloud.google.com/iap",
        IAP_AUDIENCE="/projects/123/global/backendServices/456",
        IAP_JWKS_URL="https://www.gstatic.com/iap/verify/public_key-jwk",
    )

    assert settings.auth_mode == "oidc"
    assert settings.iap_required is True
