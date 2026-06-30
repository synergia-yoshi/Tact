from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

SENSITIVE_KEY_MARKERS = (
    "api_key",
    "apikey",
    "authorization",
    "auth_token",
    "password",
    "secret",
    "token",
)
EMAIL_PATTERN = re.compile(
    r"(?P<name>[A-Z0-9._%+-])[^@\s]*@(?P<domain>[A-Z0-9.-]+\.[A-Z]{2,})",
    re.I,
)

SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    ),
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}


def mask_sensitive_data(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            key: "***redacted***" if _is_sensitive_key(str(key)) else mask_sensitive_data(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [mask_sensitive_data(item) for item in value]
    if isinstance(value, tuple):
        return tuple(mask_sensitive_data(item) for item in value)
    if isinstance(value, str):
        return EMAIL_PATTERN.sub(r"\g<name>***@\g<domain>", value)
    return value


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower().replace("-", "_")
    return any(marker in lowered for marker in SENSITIVE_KEY_MARKERS)
