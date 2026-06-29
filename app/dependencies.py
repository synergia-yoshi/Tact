from dataclasses import dataclass
from functools import lru_cache

from app.adapters.llm import LLMAdapter, MockLLMAdapter
from app.adapters.measurement import MeasurementAdapter, MockMeasurementAdapter
from app.adapters.media import MediaAdapter, MockMediaAdapter
from app.config import Settings, get_settings
from app.firestore_repositories import (
    FirestoreAuditRepository,
    FirestoreCampaignRepository,
    create_firestore_client,
)
from app.repositories import (
    AuditRepository,
    CampaignRepository,
    InMemoryAuditRepository,
    InMemoryCampaignRepository,
)
from app.secrets import GoogleSecretManagerResolver, PlainSecretResolver, SecretResolver
from app.services import CampaignService


@dataclass(frozen=True)
class RepositoryBundle:
    campaign: CampaignRepository
    audit: AuditRepository


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


@lru_cache
def get_measurement_adapter() -> MeasurementAdapter:
    settings = get_settings()
    if settings.measurement_adapter == "mock":
        return MockMeasurementAdapter()
    raise NotImplementedError("Real measurement adapter is not implemented in MVP v3.")


def settings_dependency() -> Settings:
    return get_settings()


@lru_cache
def get_repository_bundle() -> RepositoryBundle:
    settings = get_settings()
    if settings.storage_backend == "memory":
        return RepositoryBundle(
            campaign=InMemoryCampaignRepository(),
            audit=InMemoryAuditRepository(),
        )
    if settings.storage_backend == "firestore":
        client = create_firestore_client(
            project_id=settings.gcp_project_id,
            database=settings.firestore_database,
        )
        return RepositoryBundle(
            campaign=FirestoreCampaignRepository(
                client=client,
                collection_prefix=settings.firestore_collection_prefix,
            ),
            audit=FirestoreAuditRepository(
                client=client,
                collection_prefix=settings.firestore_collection_prefix,
            ),
        )
    raise NotImplementedError(f"Unsupported storage backend: {settings.storage_backend}")


def get_campaign_repository() -> CampaignRepository:
    return get_repository_bundle().campaign


def get_audit_repository() -> AuditRepository:
    return get_repository_bundle().audit


@lru_cache
def get_secret_resolver() -> SecretResolver:
    settings = get_settings()
    if any(
        GoogleSecretManagerResolver.is_secret_ref(value)
        for value in (settings.media_api_key, settings.llm_api_key, settings.auth_token_secret)
    ):
        return GoogleSecretManagerResolver(project_id=settings.gcp_project_id)
    return PlainSecretResolver()


def get_campaign_service() -> CampaignService:
    return CampaignService(
        settings=get_settings(),
        llm_adapter=get_llm_adapter(),
        media_adapter=get_media_adapter(),
        measurement_adapter=get_measurement_adapter(),
        repository=get_campaign_repository(),
        audit_repository=get_audit_repository(),
    )
