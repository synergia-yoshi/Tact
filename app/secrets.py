from __future__ import annotations

from abc import ABC, abstractmethod


class SecretResolver(ABC):
    @abstractmethod
    def resolve(self, value: str | None) -> str | None:
        """Resolve a server-side secret reference into a secret value."""


class PlainSecretResolver(SecretResolver):
    def resolve(self, value: str | None) -> str | None:
        return value or None


class GoogleSecretManagerResolver(SecretResolver):
    def __init__(self, *, project_id: str | None = None, client: object | None = None) -> None:
        self._project_id = project_id
        self._client = client or self._create_client()

    def resolve(self, value: str | None) -> str | None:
        if not value:
            return None
        if not self.is_secret_ref(value):
            return value

        name = self._normalize_name(value)
        response = self._client.access_secret_version(request={"name": name})
        return response.payload.data.decode("utf-8")

    @staticmethod
    def is_secret_ref(value: str | None) -> bool:
        if not value:
            return False
        return value.startswith(("sm://", "secretmanager://"))

    def _normalize_name(self, value: str) -> str:
        name = value.removeprefix("sm://").removeprefix("secretmanager://")
        if name.startswith("projects/"):
            return name
        if self._project_id and name.startswith("secrets/"):
            return f"projects/{self._project_id}/{name}"
        if self._project_id and "/" not in name:
            return f"projects/{self._project_id}/secrets/{name}/versions/latest"
        raise ValueError(
            "Secret Manager refs must be sm://projects/... or set GCP_PROJECT_ID "
            "for sm://secrets/... / sm://<secret-name> refs."
        )

    def _create_client(self) -> object:
        try:
            from google.cloud import secretmanager
        except ImportError as error:
            raise RuntimeError(
                "Install the gcp extra to use Secret Manager: pip install -e '.[gcp]'"
            ) from error
        return secretmanager.SecretManagerServiceClient()
