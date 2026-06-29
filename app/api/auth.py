from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth import create_signed_auth_token
from app.config import Settings, get_settings

AuthRole = Literal["viewer", "operator", "approver", "admin"]

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class DevTokenRequest(BaseModel):
    role: AuthRole = "operator"
    actor_id: str | None = Field(default=None, max_length=80)
    org_id: str = Field(default="dev-org", max_length=80)


class DevTokenResponse(BaseModel):
    token: str | None
    actor_id: str
    org_id: str
    roles: list[AuthRole]
    expires_at: datetime | None
    auth_mode: str


@router.post("/dev-token", response_model=DevTokenResponse)
async def create_dev_token(
    request: DevTokenRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> DevTokenResponse:
    if settings.app_env.lower() in {"prod", "production"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Development token minting is disabled in production",
        )

    actor_id = request.actor_id or f"ui-{request.role}"
    if settings.auth_mode == "disabled":
        return DevTokenResponse(
            token=None,
            actor_id=actor_id,
            org_id=request.org_id,
            roles=[request.role],
            expires_at=None,
            auth_mode=settings.auth_mode,
        )

    if settings.auth_mode != "signed_bearer":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unsupported auth mode: {settings.auth_mode}",
        )
    if not settings.auth_token_secret or settings.auth_token_secret.startswith("sm://"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Plain AUTH_TOKEN_SECRET is required for local dev token minting",
        )

    expires_at = datetime.now(UTC) + timedelta(hours=1)
    token = create_signed_auth_token(
        secret=settings.auth_token_secret,
        actor_id=actor_id,
        org_id=request.org_id,
        roles=[request.role],
        expires_at=expires_at,
    )
    return DevTokenResponse(
        token=token,
        actor_id=actor_id,
        org_id=request.org_id,
        roles=[request.role],
        expires_at=expires_at,
        auth_mode=settings.auth_mode,
    )
