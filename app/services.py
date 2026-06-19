from __future__ import annotations

import json

from app.adapters.llm import LLMAdapter, LLMChatRequest, LLMMessage
from app.adapters.media import (
    MediaAdapter,
    MediaPerformanceRequest,
    MediaPerformanceResponse,
    MediaPlanRequest,
    MediaPublishRequest,
)
from app.config import Settings
from app.models.campaign import CampaignBrief, CampaignProposal, CreativeDraft
from app.repositories import CampaignRepository


class CampaignNotFoundError(LookupError):
    pass


class CampaignNotPublishedError(RuntimeError):
    pass


class CampaignService:
    def __init__(
        self,
        *,
        settings: Settings,
        llm_adapter: LLMAdapter,
        media_adapter: MediaAdapter,
        repository: CampaignRepository,
    ) -> None:
        self._settings = settings
        self._llm_adapter = llm_adapter
        self._media_adapter = media_adapter
        self._repository = repository

    async def create_proposal(self, brief: CampaignBrief) -> CampaignProposal:
        llm_response = await self._llm_adapter.create_chat_completion(
            LLMChatRequest(
                model=self._settings.mock_llm_model,
                messages=[
                    LLMMessage(
                        role="system",
                        content=(
                            "You create concise campaign creative drafts. "
                            "Return JSON with headline, body, and call_to_action."
                        ),
                    ),
                    LLMMessage(
                        role="user",
                        content=(
                            f"Campaign name: {brief.name}\n"
                            f"Objective: {brief.objective}\n"
                            f"Audience: {brief.target_audience}\n"
                            f"Tone: {brief.tone}\n"
                            f"KPIs: {', '.join(brief.kpis) if brief.kpis else 'not specified'}"
                        ),
                    ),
                ],
                response_format={"type": "json_object"},
                metadata={"workflow": "campaign_proposal"},
            )
        )
        creative = self._creative_from_llm(llm_response.choices[0].message.content, brief)
        media_plan = await self._media_adapter.create_plan(
            MediaPlanRequest(
                account_id=self._settings.mock_media_account_id,
                campaign_name=brief.name,
                objective=brief.objective,
                total_budget_jpy=brief.total_budget_jpy,
                target_audience=brief.target_audience,
                channels=brief.channels,
            )
        )

        return self._repository.save(
            CampaignProposal(brief=brief, creative=creative, media_plan=media_plan)
        )

    def get_campaign(self, campaign_id: str) -> CampaignProposal:
        campaign = self._repository.get(campaign_id)
        if campaign is None:
            raise CampaignNotFoundError(campaign_id)
        return campaign

    def list_campaigns(self) -> list[CampaignProposal]:
        return self._repository.list()

    async def publish_campaign(self, campaign_id: str) -> CampaignProposal:
        campaign = self.get_campaign(campaign_id)
        if campaign.publish_result is not None:
            return campaign

        publish_result = await self._media_adapter.publish_campaign(
            MediaPublishRequest(
                account_id=self._settings.mock_media_account_id,
                campaign_id=campaign.id,
                placements=campaign.media_plan.placements,
                creative={
                    "headline": campaign.creative.headline,
                    "body": campaign.creative.body,
                    "call_to_action": campaign.creative.call_to_action,
                },
            )
        )
        campaign.publish_result = publish_result
        campaign.status = publish_result.status
        return self._repository.save(campaign)

    async def get_performance(self, campaign_id: str) -> MediaPerformanceResponse:
        campaign = self.get_campaign(campaign_id)
        if campaign.publish_result is None:
            raise CampaignNotPublishedError(campaign_id)

        return await self._media_adapter.get_performance(
            MediaPerformanceRequest(
                account_id=self._settings.mock_media_account_id,
                external_campaign_id=campaign.publish_result.external_campaign_id,
            )
        )

    def _creative_from_llm(self, content: str, brief: CampaignBrief) -> CreativeDraft:
        data = json.loads(content)
        return CreativeDraft(
            headline=data["headline"],
            body=data["body"],
            call_to_action=data["call_to_action"],
            hashtags=[f"#{channel}" for channel in brief.channels],
            compliance_notes=["Mock LLM output. Human review required before production use."],
        )
