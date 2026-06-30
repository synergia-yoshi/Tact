from __future__ import annotations

import base64
import hashlib
import json
import time
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.auth import AuthContext

SHA256_DIGESTINFO_PREFIX = bytes.fromhex("3031300d060960864801650304020105000420")


class JwtVerificationError(ValueError):
    """Raised when an OIDC/IAP JWT cannot be trusted."""


@dataclass(frozen=True)
class JwtVerifierConfig:
    issuer: str
    audience: str
    jwks_url: str
    clock_skew_seconds: int = 60
    max_token_age_seconds: int = 3600


class JwksProvider:
    def __init__(self, *, jwks_url: str, ttl_seconds: int = 300) -> None:
        self._jwks_url = jwks_url
        self._ttl_seconds = ttl_seconds
        self._cached_at = 0.0
        self._jwks: dict[str, Any] | None = None

    def get_jwks(self) -> dict[str, Any]:
        now = time.time()
        if self._jwks is not None and now - self._cached_at < self._ttl_seconds:
            return self._jwks

        with urllib.request.urlopen(self._jwks_url, timeout=5) as response:
            payload = response.read()
        jwks = json.loads(payload)
        if not isinstance(jwks, dict) or not isinstance(jwks.get("keys"), list):
            raise JwtVerificationError("JWKS payload is malformed")
        self._jwks = jwks
        self._cached_at = now
        return jwks


class StaticJwksProvider:
    def __init__(self, jwks: dict[str, Any]) -> None:
        self._jwks = jwks

    def get_jwks(self) -> dict[str, Any]:
        return self._jwks


class JwtVerifier:
    def __init__(self, *, config: JwtVerifierConfig, provider: JwksProvider | StaticJwksProvider):
        self._config = config
        self._provider = provider

    def verify(self, token: str) -> AuthContext:
        header, payload, signature, signing_input = _decode_jwt(token)
        if header.get("alg") != "RS256":
            raise JwtVerificationError("Only RS256 JWTs are accepted")
        kid = header.get("kid")
        key = self._select_key(kid if isinstance(kid, str) else None)
        _verify_rs256(key, signing_input, signature)
        self._validate_claims(payload)
        return _auth_context_from_claims(payload)

    def _select_key(self, kid: str | None) -> dict[str, Any]:
        keys = self._provider.get_jwks().get("keys", [])
        for key in keys:
            if not isinstance(key, dict):
                continue
            if key.get("kty") != "RSA":
                continue
            if kid is not None and key.get("kid") != kid:
                continue
            if key.get("use") not in {None, "sig"}:
                continue
            if key.get("alg") not in {None, "RS256"}:
                continue
            return key
        raise JwtVerificationError("No matching JWKS key found")

    def _validate_claims(self, payload: dict[str, Any]) -> None:
        now = time.time()
        issuer = payload.get("iss")
        if issuer != self._config.issuer:
            raise JwtVerificationError("JWT issuer is not allowed")

        audience = payload.get("aud")
        audiences = audience if isinstance(audience, list) else [audience]
        if self._config.audience not in audiences:
            raise JwtVerificationError("JWT audience is not allowed")

        exp = _numeric_claim(payload, "exp")
        iat = _numeric_claim(payload, "iat")
        nbf = _numeric_claim(payload, "nbf")
        skew = self._config.clock_skew_seconds
        if now >= exp + skew:
            raise JwtVerificationError("JWT has expired")
        if now + skew < nbf:
            raise JwtVerificationError("JWT is not valid yet")
        if iat - skew > now:
            raise JwtVerificationError("JWT issued-at is in the future")
        if exp - iat > self._config.max_token_age_seconds:
            raise JwtVerificationError("JWT lifetime is too long")


def _decode_jwt(token: str) -> tuple[dict[str, Any], dict[str, Any], bytes, bytes]:
    parts = token.split(".")
    if len(parts) != 3:
        raise JwtVerificationError("JWT must have three parts")
    header_b64, payload_b64, signature_b64 = parts
    try:
        header = json.loads(_base64url_decode(header_b64))
        payload = json.loads(_base64url_decode(payload_b64))
        signature = _base64url_decode(signature_b64)
    except (ValueError, json.JSONDecodeError) as error:
        raise JwtVerificationError("JWT encoding is malformed") from error
    if not isinstance(header, dict) or not isinstance(payload, dict):
        raise JwtVerificationError("JWT header and payload must be objects")
    return header, payload, signature, f"{header_b64}.{payload_b64}".encode("ascii")


def _verify_rs256(key: dict[str, Any], signing_input: bytes, signature: bytes) -> None:
    n = _jwk_int(key, "n")
    e = _jwk_int(key, "e")
    modulus_length = (n.bit_length() + 7) // 8
    if len(signature) != modulus_length:
        raise JwtVerificationError("JWT signature length does not match key")

    encoded = pow(int.from_bytes(signature, "big"), e, n).to_bytes(modulus_length, "big")
    digest = hashlib.sha256(signing_input).digest()
    expected_tail = SHA256_DIGESTINFO_PREFIX + digest
    if not encoded.startswith(b"\x00\x01"):
        raise JwtVerificationError("JWT signature padding is invalid")
    try:
        separator = encoded.index(b"\x00", 2)
    except ValueError as error:
        raise JwtVerificationError("JWT signature padding separator is missing") from error
    padding = encoded[2:separator]
    if len(padding) < 8 or any(byte != 0xFF for byte in padding):
        raise JwtVerificationError("JWT signature padding is invalid")
    if encoded[separator + 1 :] != expected_tail:
        raise JwtVerificationError("JWT signature digest does not match")


def _auth_context_from_claims(payload: dict[str, Any]) -> AuthContext:
    subject = payload.get("sub")
    org_id = payload.get("org_id")
    roles_claim = payload.get("roles", payload.get("role", "viewer"))
    roles = roles_claim if isinstance(roles_claim, list) else [roles_claim]
    if not isinstance(subject, str) or not subject:
        raise JwtVerificationError("JWT is missing sub")
    if not isinstance(org_id, str) or not org_id:
        raise JwtVerificationError("JWT is missing org_id")
    if not all(isinstance(role, str) and role for role in roles):
        raise JwtVerificationError("JWT roles claim is invalid")
    return AuthContext(actor_id=subject, org_id=org_id, roles=tuple(roles))


def _numeric_claim(payload: dict[str, Any], claim: str) -> float:
    value = payload.get(claim)
    if not isinstance(value, int | float) or isinstance(value, bool):
        raise JwtVerificationError(f"JWT is missing numeric {claim}")
    return float(value)


def _jwk_int(key: dict[str, Any], field: str) -> int:
    value = key.get(field)
    if not isinstance(value, str) or not value:
        raise JwtVerificationError(f"JWKS key is missing {field}")
    return int.from_bytes(_base64url_decode(value), "big")


def _base64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
