from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


AdapterKind = Literal["mock", "real"]


class Settings(BaseSettings):
    """Server-side configuration loaded from environment variables or .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = Field(default="local", alias="APP_ENV")
    app_name: str = Field(default="Tact Cursor API", alias="APP_NAME")
    media_adapter: AdapterKind = Field(default="mock", alias="MEDIA_ADAPTER")
    llm_adapter: AdapterKind = Field(default="mock", alias="LLM_ADAPTER")

    mock_media_account_id: str = Field(default="mock-account-001", alias="MOCK_MEDIA_ACCOUNT_ID")
    mock_llm_model: str = Field(default="tact-mock-v3", alias="MOCK_LLM_MODEL")

    media_api_base_url: str | None = Field(default=None, alias="MEDIA_API_BASE_URL")
    media_api_key: str | None = Field(default=None, alias="MEDIA_API_KEY")
    llm_api_base_url: str | None = Field(default=None, alias="LLM_API_BASE_URL")
    llm_api_key: str | None = Field(default=None, alias="LLM_API_KEY")

    @property
    def public_status(self) -> dict[str, str]:
        return {
            "app": self.app_name,
            "environment": self.app_env,
            "media_adapter": self.media_adapter,
            "llm_adapter": self.llm_adapter,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
