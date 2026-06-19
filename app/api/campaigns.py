from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_campaign_service
from app.models.campaign import CampaignBrief, CampaignProposal
from app.services import CampaignNotFoundError, CampaignService

router = APIRouter(prefix="/api/v1/campaigns", tags=["campaigns"])


@router.post(
    "/proposals",
    response_model=CampaignProposal,
    status_code=status.HTTP_201_CREATED,
)
async def create_campaign_proposal(
    brief: CampaignBrief,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
) -> CampaignProposal:
    return await service.create_proposal(brief)


@router.get("", response_model=list[CampaignProposal])
async def list_campaigns(
    service: Annotated[CampaignService, Depends(get_campaign_service)],
) -> list[CampaignProposal]:
    return service.list_campaigns()


@router.get("/{campaign_id}", response_model=CampaignProposal)
async def get_campaign(
    campaign_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
) -> CampaignProposal:
    try:
        return service.get_campaign(campaign_id)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error
