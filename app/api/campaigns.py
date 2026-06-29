from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.adapters.media import MediaPerformanceResponse
from app.auth import AuthContext, get_auth_context
from app.dependencies import get_campaign_service
from app.models.audit import AuditEntry, AuditVerificationResult
from app.models.campaign import CampaignBrief, CampaignProposal
from app.models.kill_switch import KillSwitchResult
from app.models.legal import LegalCheckResult
from app.models.measurement import MetricSnapshot
from app.services import (
    AgentActionNotFoundError,
    AgentActionNotPendingError,
    CampaignLegalCheckRequiredError,
    CampaignMeasurementRequiredError,
    CampaignNotFoundError,
    CampaignNotPublishedError,
    CampaignService,
)

router = APIRouter(prefix="/api/v1/campaigns", tags=["campaigns"])


@router.post(
    "/proposals",
    response_model=CampaignProposal,
    status_code=status.HTTP_201_CREATED,
)
async def create_campaign_proposal(
    brief: CampaignBrief,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> CampaignProposal:
    return await service.create_proposal(brief, auth_context)


@router.get("", response_model=list[CampaignProposal])
async def list_campaigns(
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> list[CampaignProposal]:
    return service.list_campaigns(auth_context)


@router.get("/audit/verify", response_model=AuditVerificationResult)
async def verify_audit(
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    _auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> AuditVerificationResult:
    return service.verify_audit()


@router.get("/{campaign_id}", response_model=CampaignProposal)
async def get_campaign(
    campaign_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> CampaignProposal:
    try:
        return service.get_campaign(campaign_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error


@router.post("/{campaign_id}/publish", response_model=CampaignProposal)
async def publish_campaign(
    campaign_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> CampaignProposal:
    try:
        return await service.publish_campaign(campaign_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error
    except CampaignMeasurementRequiredError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Measurement snapshot required before publish approval can be requested",
        ) from error
    except CampaignLegalCheckRequiredError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Passed legal check required before publish approval can be requested",
        ) from error


@router.post("/{campaign_id}/measurements/refresh", response_model=MetricSnapshot)
async def refresh_campaign_measurements(
    campaign_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> MetricSnapshot:
    try:
        return await service.refresh_measurements(campaign_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error


@router.get("/{campaign_id}/measurements/latest", response_model=MetricSnapshot)
async def get_latest_campaign_measurement(
    campaign_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> MetricSnapshot:
    try:
        snapshot = service.latest_measurement(campaign_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error
    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Measurement snapshot not found",
        )
    return snapshot


@router.post("/{campaign_id}/legal-checks/run", response_model=LegalCheckResult)
async def run_campaign_legal_check(
    campaign_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> LegalCheckResult:
    try:
        return service.run_legal_check(campaign_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error


@router.get("/{campaign_id}/legal-checks/latest", response_model=LegalCheckResult)
async def get_latest_campaign_legal_check(
    campaign_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> LegalCheckResult:
    try:
        result = service.latest_legal_check(campaign_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Legal check not found",
        )
    return result


@router.post("/{campaign_id}/kill-switch/evaluate", response_model=KillSwitchResult)
async def evaluate_campaign_kill_switch(
    campaign_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> KillSwitchResult:
    try:
        return await service.evaluate_kill_switch(campaign_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error


@router.get("/{campaign_id}/kill-switch/latest", response_model=KillSwitchResult)
async def get_latest_campaign_kill_switch(
    campaign_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> KillSwitchResult:
    try:
        result = service.latest_kill_switch_result(campaign_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Kill Switch result not found",
        )
    return result


@router.post("/{campaign_id}/actions/{action_id}/approve", response_model=CampaignProposal)
async def approve_campaign_action(
    campaign_id: str,
    action_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> CampaignProposal:
    try:
        return await service.approve_action(campaign_id, action_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error
    except AgentActionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action not found",
        ) from error
    except AgentActionNotPendingError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Action is not pending approval",
        ) from error


@router.post("/{campaign_id}/actions/{action_id}/reject", response_model=CampaignProposal)
async def reject_campaign_action(
    campaign_id: str,
    action_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> CampaignProposal:
    try:
        return service.reject_action(campaign_id, action_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error
    except AgentActionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action not found",
        ) from error
    except AgentActionNotPendingError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Action is not pending approval",
        ) from error


@router.get("/{campaign_id}/performance", response_model=MediaPerformanceResponse)
async def get_campaign_performance(
    campaign_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> MediaPerformanceResponse:
    try:
        return await service.get_performance(campaign_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error
    except CampaignNotPublishedError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Campaign must be published before performance is available",
        ) from error


@router.get("/{campaign_id}/audit", response_model=list[AuditEntry])
async def list_campaign_audit(
    campaign_id: str,
    service: Annotated[CampaignService, Depends(get_campaign_service)],
    auth_context: Annotated[AuthContext, Depends(get_auth_context)],
) -> list[AuditEntry]:
    try:
        return service.list_campaign_audit(campaign_id, auth_context)
    except CampaignNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found",
        ) from error
