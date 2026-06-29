from __future__ import annotations

import base64
import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.config import Settings, get_settings
from app.secrets import GoogleSecretManagerResolver


@dataclass(frozen=True)
class AuthContext:
    actor_id: str
    org_id: str
    roles: tuple[str, ...] = ("operator",)

    @classmethod
    def dev(cls) -> AuthContext:
        return cls(actor_id="dev-user", org_id="dev-org", roles=("admin",))


def create_signed_auth_token(
    *,
    secret: str,
    actor_id: str,
    org_id: str,
    roles: list[str] | None = None,
    expires_at: datetime | None = None,
) -> str:
    expires_at = expires_at or datetime.now(UTC) + timedelta(hours=1)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    payload = {
        "sub": actor_id,
        "org_id": org_id,
        "roles": roles or ["operator"],
        "exp": int(expires_at.timestamp()),
    }
    payload_b64 = _base64url_encode(json.dumps(payload, sort_keys=True).encode("utf-8"))
    signature = _sign(payload_b64, secret)
    return f"{payload_b64}.{signature}"


def verify_signed_auth_token(*, token: str, secret: str) -> AuthContext:
    try:
        payload_b64, signature = token.split(".", maxsplit=1)
    except ValueError as error:
        raise ValueError("Malformed bearer token") from error

    expected = _sign(payload_b64, secret)
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Invalid bearer token signature")

    payload = json.loads(_base64url_decode(payload_b64))
    actor_id = payload.get("sub")
    org_id = payload.get("org_id")
    roles = payload.get("roles") or ["operator"]
    expires_at = payload.get("exp")
    if not isinstance(actor_id, str) or not actor_id:
        raise ValueError("Bearer token is missing sub")
    if not isinstance(org_id, str) or not org_id:
        raise ValueError("Bearer token is missing org_id")
    if not isinstance(roles, list) or not all(isinstance(role, str) for role in roles):
        raise ValueError("Bearer token roles must be a string list")
    if not isinstance(expires_at, int | float) or isinstance(expires_at, bool):
        raise ValueError("Bearer token is missing exp")
    if datetime.now(UTC).timestamp() >= expires_at:
        raise ValueError("Bearer token has expired")
    return AuthContext(actor_id=actor_id, org_id=org_id, roles=tuple(roles))


def get_auth_context(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
) -> AuthContext:
    if settings.auth_mode == "disabled":
        return AuthContext.dev()

    if settings.auth_mode == "signed_bearer":
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Bearer token required",
            )
        auth_token_secret = _resolve_auth_token_secret(settings)
        if not auth_token_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="AUTH_TOKEN_SECRET is required when AUTH_MODE=signed_bearer",
            )
        token = authorization.removeprefix("Bearer ").strip()
        try:
            return verify_signed_auth_token(token=token, secret=auth_token_secret)
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid bearer token",
            ) from error

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Unsupported auth mode: {settings.auth_mode}",
    )


def _sign(payload_b64: str, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256)
    return _base64url_encode(digest.digest())


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _resolve_auth_token_secret(settings: Settings) -> str | None:
    if GoogleSecretManagerResolver.is_secret_ref(settings.auth_token_secret):
        return GoogleSecretManagerResolver(project_id=settings.gcp_project_id).resolve(
            settings.auth_token_secret
        )
    return settings.auth_token_secret
