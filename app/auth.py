from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import uuid4

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


class ReplayCache:
    def __init__(self) -> None:
        self._seen: dict[str, float] = {}

    def mark_once(self, token_id: str, *, expires_at: float) -> None:
        now = time.time()
        self._seen = {
            jti: expiry for jti, expiry in self._seen.items() if expiry + 60 > now
        }
        if token_id in self._seen:
            raise ValueError("Bearer token has already been used")
        self._seen[token_id] = expires_at


SIGNED_BEARER_ISSUER = "tact-local"
SIGNED_BEARER_AUDIENCE = "tact-api"
SIGNED_BEARER_REPLAY_CACHE = ReplayCache()


def create_signed_auth_token(
    *,
    secret: str,
    actor_id: str,
    org_id: str,
    roles: list[str] | None = None,
    expires_at: datetime | None = None,
    issued_at: datetime | None = None,
    not_before: datetime | None = None,
    token_id: str | None = None,
    issuer: str = SIGNED_BEARER_ISSUER,
    audience: str = SIGNED_BEARER_AUDIENCE,
) -> str:
    issued_at = issued_at or datetime.now(UTC)
    if issued_at.tzinfo is None:
        issued_at = issued_at.replace(tzinfo=UTC)
    expires_at = expires_at or datetime.now(UTC) + timedelta(hours=1)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    not_before = not_before or issued_at
    if not_before.tzinfo is None:
        not_before = not_before.replace(tzinfo=UTC)
    payload = {
        "sub": actor_id,
        "org_id": org_id,
        "roles": roles or ["operator"],
        "exp": int(expires_at.timestamp()),
        "iat": int(issued_at.timestamp()),
        "nbf": int(not_before.timestamp()),
        "jti": token_id or f"jti_{uuid4().hex}",
        "iss": issuer,
        "aud": audience,
    }
    payload_b64 = _base64url_encode(json.dumps(payload, sort_keys=True).encode("utf-8"))
    signature = _sign(payload_b64, secret)
    return f"{payload_b64}.{signature}"


def verify_signed_auth_token(
    *,
    token: str,
    secret: str,
    issuer: str = SIGNED_BEARER_ISSUER,
    audience: str = SIGNED_BEARER_AUDIENCE,
    clock_skew_seconds: int = 60,
    max_token_age_seconds: int = 3600,
    replay_cache: ReplayCache | None = None,
) -> AuthContext:
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
    issued_at = payload.get("iat")
    not_before = payload.get("nbf")
    token_id = payload.get("jti")
    if not isinstance(actor_id, str) or not actor_id:
        raise ValueError("Bearer token is missing sub")
    if not isinstance(org_id, str) or not org_id:
        raise ValueError("Bearer token is missing org_id")
    if not isinstance(roles, list) or not all(isinstance(role, str) for role in roles):
        raise ValueError("Bearer token roles must be a string list")
    if not isinstance(expires_at, int | float) or isinstance(expires_at, bool):
        raise ValueError("Bearer token is missing exp")
    if not isinstance(issued_at, int | float) or isinstance(issued_at, bool):
        raise ValueError("Bearer token is missing iat")
    if not isinstance(not_before, int | float) or isinstance(not_before, bool):
        raise ValueError("Bearer token is missing nbf")
    if not isinstance(token_id, str) or not token_id:
        raise ValueError("Bearer token is missing jti")
    if payload.get("iss") != issuer:
        raise ValueError("Bearer token issuer is invalid")
    token_audience = payload.get("aud")
    audiences = token_audience if isinstance(token_audience, list) else [token_audience]
    if audience not in audiences:
        raise ValueError("Bearer token audience is invalid")
    now = datetime.now(UTC).timestamp()
    if now >= float(expires_at) + clock_skew_seconds:
        raise ValueError("Bearer token has expired")
    if now + clock_skew_seconds < float(not_before):
        raise ValueError("Bearer token is not valid yet")
    if float(issued_at) - clock_skew_seconds > now:
        raise ValueError("Bearer token issued-at is in the future")
    if float(expires_at) - float(issued_at) > max_token_age_seconds:
        raise ValueError("Bearer token lifetime exceeds maximum")
    if replay_cache is not None:
        replay_cache.mark_once(token_id, expires_at=float(expires_at))
    return AuthContext(actor_id=actor_id, org_id=org_id, roles=tuple(roles))


def get_auth_context(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header()] = None,
    x_goog_iap_jwt_assertion: Annotated[str | None, Header()] = None,
) -> AuthContext:
    if settings.auth_mode == "disabled":
        return AuthContext.dev()

    if settings.iap_required:
        if not x_goog_iap_jwt_assertion:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="IAP assertion required",
            )
        _verify_iap_assertion(settings, x_goog_iap_jwt_assertion)

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
            return verify_signed_auth_token(
                token=token,
                secret=auth_token_secret,
                issuer=settings.auth_issuer,
                audience=settings.auth_audience,
                clock_skew_seconds=settings.auth_clock_skew_seconds,
                max_token_age_seconds=settings.auth_max_token_seconds,
                replay_cache=SIGNED_BEARER_REPLAY_CACHE
                if settings.auth_replay_protection
                else None,
            )
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid bearer token",
            ) from error

    if settings.auth_mode == "oidc":
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Bearer token required",
            )
        token = authorization.removeprefix("Bearer ").strip()
        try:
            return _oidc_verifier(settings).verify(token)
        except ValueError as error:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid OIDC token",
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


def _oidc_verifier(settings: Settings):
    from app.oidc import JwksProvider, JwtVerifier, JwtVerifierConfig

    if not settings.oidc_issuer or not settings.oidc_audience or not settings.oidc_jwks_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OIDC_ISSUER, OIDC_AUDIENCE, and OIDC_JWKS_URL are required",
        )
    return JwtVerifier(
        config=JwtVerifierConfig(
            issuer=settings.oidc_issuer,
            audience=settings.oidc_audience,
            jwks_url=settings.oidc_jwks_url,
            clock_skew_seconds=settings.auth_clock_skew_seconds,
            max_token_age_seconds=settings.auth_max_token_seconds,
        ),
        provider=JwksProvider(jwks_url=settings.oidc_jwks_url),
    )


def _verify_iap_assertion(settings: Settings, assertion: str) -> None:
    from app.oidc import JwksProvider, JwtVerifier, JwtVerifierConfig

    if not settings.iap_issuer or not settings.iap_audience or not settings.iap_jwks_url:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="IAP_ISSUER, IAP_AUDIENCE, and IAP_JWKS_URL are required",
        )
    try:
        JwtVerifier(
            config=JwtVerifierConfig(
                issuer=settings.iap_issuer,
                audience=settings.iap_audience,
                jwks_url=settings.iap_jwks_url,
                clock_skew_seconds=settings.auth_clock_skew_seconds,
                max_token_age_seconds=settings.auth_max_token_seconds,
            ),
            provider=JwksProvider(jwks_url=settings.iap_jwks_url),
        ).verify(assertion)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid IAP assertion",
        ) from error
