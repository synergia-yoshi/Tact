from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AdapterKind = Literal["mock", "real"]
StorageBackend = Literal["memory", "firestore"]
AuthMode = Literal["disabled", "signed_bearer", "oidc"]


class Settings(BaseSettings):
    """Server-side configuration loaded from environment variables or .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = Field(default="local", alias="APP_ENV")
    app_name: str = Field(default="Tact API", alias="APP_NAME")
    media_adapter: AdapterKind = Field(default="mock", alias="MEDIA_ADAPTER")
    llm_adapter: AdapterKind = Field(default="mock", alias="LLM_ADAPTER")
    measurement_adapter: AdapterKind = Field(default="mock", alias="MEASUREMENT_ADAPTER")
    storage_backend: StorageBackend = Field(default="memory", alias="STORAGE_BACKEND")
    auth_mode: AuthMode = Field(default="disabled", alias="AUTH_MODE")

    mock_media_account_id: str = Field(default="mock-account-001", alias="MOCK_MEDIA_ACCOUNT_ID")
    mock_llm_model: str = Field(default="tact-mock-v3", alias="MOCK_LLM_MODEL")

    gcp_project_id: str | None = Field(default=None, alias="GCP_PROJECT_ID")
    firestore_database: str | None = Field(default=None, alias="FIRESTORE_DATABASE")
    firestore_collection_prefix: str = Field(
        default="tact_mvp_v3",
        alias="FIRESTORE_COLLECTION_PREFIX",
    )

    media_api_base_url: str | None = Field(default=None, alias="MEDIA_API_BASE_URL")
    media_api_key: str | None = Field(default=None, alias="MEDIA_API_KEY")
    llm_api_base_url: str | None = Field(default=None, alias="LLM_API_BASE_URL")
    llm_api_key: str | None = Field(default=None, alias="LLM_API_KEY")
    auth_token_secret: str | None = Field(default=None, alias="AUTH_TOKEN_SECRET")
    auth_issuer: str = Field(default="tact-local", alias="AUTH_ISSUER")
    auth_audience: str = Field(default="tact-api", alias="AUTH_AUDIENCE")
    auth_clock_skew_seconds: int = Field(default=60, alias="AUTH_CLOCK_SKEW_SECONDS")
    auth_max_token_seconds: int = Field(default=3600, alias="AUTH_MAX_TOKEN_SECONDS")
    auth_replay_protection: bool = Field(default=False, alias="AUTH_REPLAY_PROTECTION")

    oidc_issuer: str | None = Field(default=None, alias="OIDC_ISSUER")
    oidc_audience: str | None = Field(default=None, alias="OIDC_AUDIENCE")
    oidc_jwks_url: str | None = Field(default=None, alias="OIDC_JWKS_URL")

    iap_required: bool = Field(default=False, alias="IAP_REQUIRED")
    iap_issuer: str | None = Field(default=None, alias="IAP_ISSUER")
    iap_audience: str | None = Field(default=None, alias="IAP_AUDIENCE")
    iap_jwks_url: str | None = Field(default=None, alias="IAP_JWKS_URL")

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.auth_max_token_seconds <= 0:
            raise ValueError("AUTH_MAX_TOKEN_SECONDS must be positive")
        if self.auth_clock_skew_seconds < 0:
            raise ValueError("AUTH_CLOCK_SKEW_SECONDS cannot be negative")

        if self.auth_mode == "oidc" and (
            not self.oidc_issuer or not self.oidc_audience or not self.oidc_jwks_url
        ):
            raise ValueError("OIDC_ISSUER, OIDC_AUDIENCE, and OIDC_JWKS_URL are required")

        if self.iap_required and (
            not self.iap_issuer or not self.iap_audience or not self.iap_jwks_url
        ):
            raise ValueError("IAP_ISSUER, IAP_AUDIENCE, and IAP_JWKS_URL are required")

        if self.app_env.lower() in {"prod", "production"}:
            if self.auth_mode != "oidc":
                raise ValueError("AUTH_MODE=oidc is required when APP_ENV=production")
            if not self.iap_required:
                raise ValueError("IAP_REQUIRED=true is required when APP_ENV=production")
        return self

    @property
    def public_status(self) -> dict[str, str]:
        return {
            "app": self.app_name,
            "environment": self.app_env,
            "media_adapter": self.media_adapter,
            "llm_adapter": self.llm_adapter,
            "measurement_adapter": self.measurement_adapter,
            "storage_backend": self.storage_backend,
            "auth_mode": self.auth_mode,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
