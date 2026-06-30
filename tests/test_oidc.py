from __future__ import annotations

import base64
import hashlib
import json
import random
from datetime import UTC, datetime, timedelta

import pytest

from app.oidc import JwtVerificationError, JwtVerifier, JwtVerifierConfig, StaticJwksProvider

RSA_E = 65537
DIGESTINFO_SHA256 = bytes.fromhex("3031300d060960864801650304020105000420")


def test_oidc_rs256_jwks_token_is_accepted() -> None:
    key = _test_rsa_key()
    verifier = _verifier(key["jwks"])
    token = _jwt(key, _claims())

    context = verifier.verify(token)

    assert context.actor_id == "oidc-user"
    assert context.org_id == "org-a"
    assert context.roles == ("approver",)


@pytest.mark.parametrize(
    ("claim_patch", "message"),
    [
        ({"exp": datetime.now(UTC) - timedelta(minutes=5)}, "expired"),
        ({"nbf": datetime.now(UTC) + timedelta(minutes=5)}, "not valid yet"),
        ({"iss": "https://wrong.example"}, "issuer"),
        ({"aud": "wrong-api"}, "audience"),
    ],
)
def test_oidc_rejects_temporal_and_issuer_audience_attacks(
    claim_patch: dict,
    message: str,
) -> None:
    key = _test_rsa_key()
    claims = _claims()
    claims.update(claim_patch)
    token = _jwt(key, claims)

    with pytest.raises(JwtVerificationError, match=message):
        _verifier(key["jwks"]).verify(token)


def test_oidc_rejects_tampered_signature() -> None:
    key = _test_rsa_key()
    token = _jwt(key, _claims())
    tampered = token[:-2] + "AA"

    with pytest.raises(JwtVerificationError, match="signature"):
        _verifier(key["jwks"]).verify(tampered)


def _verifier(jwks: dict) -> JwtVerifier:
    return JwtVerifier(
        config=JwtVerifierConfig(
            issuer="https://issuer.example",
            audience="tact-api",
            jwks_url="memory://jwks",
            clock_skew_seconds=0,
            max_token_age_seconds=3600,
        ),
        provider=StaticJwksProvider(jwks),
    )


def _claims() -> dict:
    now = datetime.now(UTC)
    return {
        "iss": "https://issuer.example",
        "aud": "tact-api",
        "sub": "oidc-user",
        "org_id": "org-a",
        "roles": ["approver"],
        "iat": now,
        "nbf": now,
        "exp": now + timedelta(minutes=30),
    }


def _jwt(key: dict, payload: dict) -> str:
    header = {"alg": "RS256", "kid": "test-key", "typ": "JWT"}
    encoded_header = _b64_json(header)
    encoded_payload = _b64_json(
        {
            item_key: _timestamp(value) if isinstance(value, datetime) else value
            for item_key, value in payload.items()
        }
    )
    signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
    signature = _rsa_sign(key, signing_input)
    return f"{encoded_header}.{encoded_payload}.{_b64(signature)}"


def _rsa_sign(key: dict, signing_input: bytes) -> bytes:
    n = key["n"]
    d = key["d"]
    modulus_length = (n.bit_length() + 7) // 8
    digest = hashlib.sha256(signing_input).digest()
    tail = DIGESTINFO_SHA256 + digest
    padding = b"\xff" * (modulus_length - len(tail) - 3)
    encoded = b"\x00\x01" + padding + b"\x00" + tail
    return pow(int.from_bytes(encoded, "big"), d, n).to_bytes(modulus_length, "big")


def _test_rsa_key() -> dict:
    rng = random.Random(20260630)
    p = _prime(rng, 512)
    q = _prime(rng, 512)
    while q == p:
        q = _prime(rng, 512)
    n = p * q
    phi = (p - 1) * (q - 1)
    d = pow(RSA_E, -1, phi)
    return {
        "n": n,
        "d": d,
        "jwks": {
            "keys": [
                {
                    "kty": "RSA",
                    "kid": "test-key",
                    "use": "sig",
                    "alg": "RS256",
                    "n": _b64_int(n),
                    "e": _b64_int(RSA_E),
                }
            ]
        },
    }


def _prime(rng: random.Random, bits: int) -> int:
    while True:
        candidate = rng.getrandbits(bits) | (1 << (bits - 1)) | 1
        if _is_probable_prime(candidate):
            return candidate


def _is_probable_prime(value: int) -> bool:
    small_primes = (3, 5, 7, 11, 13, 17, 19, 23, 29, 31)
    if any(value % prime == 0 for prime in small_primes):
        return value in small_primes
    exponent = value - 1
    rounds = 0
    while exponent % 2 == 0:
        exponent //= 2
        rounds += 1
    for base in (2, 3, 5, 7, 11, 13, 17):
        if base >= value:
            continue
        trial = pow(base, exponent, value)
        if trial in {1, value - 1}:
            continue
        for _ in range(rounds - 1):
            trial = pow(trial, 2, value)
            if trial == value - 1:
                break
        else:
            return False
    return True


def _timestamp(value: datetime) -> int:
    return int(value.timestamp())


def _b64_json(value: dict) -> str:
    return _b64(json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def _b64_int(value: int) -> str:
    return _b64(value.to_bytes((value.bit_length() + 7) // 8, "big"))


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")
