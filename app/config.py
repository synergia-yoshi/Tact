from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

AdapterKind = Literal["mock", "real"]
StorageBackend = Literal["memory", "firestore"]
AuthMode = Literal["disabled", "signed_bearer"]


class Settings(BaseSettings):
    """Server-side configuration loaded from environment variables or .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = Field(default="local", alias="APP_ENV")
    app_name: str = Field(default="Tact Cursor API", alias="APP_NAME")
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
