from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import AuthContext, get_auth_context
from app.dependencies import get_campaign_service
from app.models.roles import RoleAssignment, RoleAssignmentUpdate
from app.services import CampaignService

router = APIRouter(prefix="/api/v1/roles", tags=["roles"])


@router.get("", response_model=list[RoleAssignment])
async def list_role_assignments(
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> list[RoleAssignment]:
    return service.list_role_assignments(auth_context)


@router.post("/{actor_id}", response_model=RoleAssignment)
async def update_role_assignment(
    actor_id: str,
    update: RoleAssignmentUpdate,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> RoleAssignment:
    return service.update_role_assignment(actor_id, update, auth_context)
