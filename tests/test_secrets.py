import pytest

from app.secrets import GoogleSecretManagerResolver, PlainSecretResolver


class FakeSecretPayload:
    data = b"resolved-secret"


class FakeSecretResponse:
    payload = FakeSecretPayload()


class FakeSecretClient:
    def __init__(self) -> None:
        self.requests: list[dict[str, str]] = []

    def access_secret_version(self, *, request: dict[str, str]) -> FakeSecretResponse:
        self.requests.append(request)
        return FakeSecretResponse()


def test_plain_secret_resolver_returns_environment_values() -> None:
    resolver = PlainSecretResolver()

    assert resolver.resolve("plain-value") == "plain-value"
    assert resolver.resolve("") is None
    assert resolver.resolve(None) is None


def test_google_secret_manager_resolver_resolves_project_relative_ref() -> None:
    client = FakeSecretClient()
    resolver = GoogleSecretManagerResolver(project_id="tact-prod", client=client)

    value = resolver.resolve("sm://media-api-key")

    assert value == "resolved-secret"
    assert client.requests == [
        {"name": "projects/tact-prod/secrets/media-api-key/versions/latest"}
    ]


def test_google_secret_manager_resolver_preserves_full_ref() -> None:
    client = FakeSecretClient()
    resolver = GoogleSecretManagerResolver(client=client)

    value = resolver.resolve("sm://projects/tact-prod/secrets/media-api-key/versions/3")

    assert value == "resolved-secret"
    assert client.requests == [
        {"name": "projects/tact-prod/secrets/media-api-key/versions/3"}
    ]


def test_google_secret_manager_resolver_requires_project_for_short_refs() -> None:
    resolver = GoogleSecretManagerResolver(client=FakeSecretClient())

    with pytest.raises(ValueError):
        resolver.resolve("sm://media-api-key")
