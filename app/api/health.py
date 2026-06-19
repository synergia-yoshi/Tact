from typing import Annotated

from fastapi import APIRouter, Depends

from app.config import Settings
from app.dependencies import settings_dependency

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(settings: Annotated[Settings, Depends(settings_dependency)]) -> dict[str, str]:
    return {"status": "ok", **settings.public_status}
