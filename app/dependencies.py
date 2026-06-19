from functools import lru_cache

from app.adapters.llm import LLMAdapter, MockLLMAdapter
from app.adapters.media import MediaAdapter, MockMediaAdapter
from app.config import Settings, get_settings


@lru_cache
def get_llm_adapter() -> LLMAdapter:
    settings = get_settings()
    if settings.llm_adapter == "mock":
        return MockLLMAdapter()
    raise NotImplementedError("Real LLM adapter is not implemented in MVP v3.")


@lru_cache
def get_media_adapter() -> MediaAdapter:
    settings = get_settings()
    if settings.media_adapter == "mock":
        return MockMediaAdapter()
    raise NotImplementedError("Real media adapter is not implemented in MVP v3.")


def settings_dependency() -> Settings:
    return get_settings()
