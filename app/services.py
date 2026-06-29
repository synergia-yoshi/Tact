from __future__ import annotations

import json

from app.adapters.llm import LLMAdapter, LLMChatRequest, LLMMessage
from app.adapters.measurement import MeasurementAdapter, MeasurementReadRequest
from app.adapters.media import (
    MediaAdapter,
    MediaDeliveryStatusRequest,
    MediaPerformanceRequest,
    MediaPerformanceResponse,
    MediaPlanRequest,
    MediaPublishRequest,
)
from app.auth import AuthContext
from app.config import Settings
from app.legal_checks import run_rule_based_legal_check
from app.models.audit import AuditEntry, AuditVerificationResult
from app.models.campaign import AgentAction, CampaignBrief, CampaignProposal, CreativeDraft
from app.models.kill_switch import KillSwitchResult
from app.models.legal import LegalCheckResult
from app.models.measurement import MetricSnapshot
from app.policy import ensure_allowed
from app.repositories import AuditRepository, CampaignRepository


class CampaignNotFoundError(LookupError):
    pass


class CampaignNotPublishedError(RuntimeError):
    pass


class CampaignMeasurementRequiredError(RuntimeError):
    pass


class CampaignLegalCheckRequiredError(RuntimeError):
    pass


class AgentActionNotFoundError(LookupError):
    pass


class AgentActionNotPendingError(RuntimeError):
    pass


class CampaignService:
    def __init__(
        self,
        *,
        settings: Settings,
        llm_adapter: LLMAdapter,
        media_adapter: MediaAdapter,
        measurement_adapter: MeasurementAdapter,
        repository: CampaignRepository,
        audit_repository: AuditRepository,
    ) -> None:
        self._settings = settings
        self._llm_adapter = llm_adapter
        self._media_adapter = media_adapter
        self._measurement_adapter = measurement_adapter
        self._repository = repository
        self._audit_repository = audit_repository

    async def create_proposal(
        self,
        brief: CampaignBrief,
        auth_context: AuthContext | None = None,
    ) -> CampaignProposal:
        auth_context = auth_context or AuthContext.dev()
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

        proposal = self._repository.save(
            CampaignProposal(
                org_id=auth_context.org_id,
                created_by=auth_context.actor_id,
                brief=brief,
                creative=creative,
                media_plan=media_plan,
            )
        )
        self._audit_repository.append(
            event_type="campaign.proposal.created",
            org_id=auth_context.org_id,
            actor=auth_context.actor_id,
            subject_type="campaign",
            subject_id=proposal.id,
            summary="Campaign proposal created from server-side LLM and media planning.",
            payload={
                "brief": brief.model_dump(mode="json"),
                "media_plan_request_id": media_plan.request_id,
                "creative_source": "mock_llm_adapter",
            },
            diff={"status": {"from": None, "to": proposal.status}},
            guardrail_result={
                "status": "passed",
                "checks": [
                    {
                        "name": "server_generated_proposal",
                        "result": "passed",
                        "message": (
                            "Creative, media plan, and audit entry were generated "
                            "server-side."
                        ),
                    }
                ],
            },
        )
        return proposal

    def get_campaign(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
    ) -> CampaignProposal:
        auth_context = auth_context or AuthContext.dev()
        campaign = self._repository.get(campaign_id, org_id=auth_context.org_id)
        if campaign is None:
            raise CampaignNotFoundError(campaign_id)
        return campaign

    def list_campaigns(self, auth_context: AuthContext | None = None) -> list[CampaignProposal]:
        auth_context = auth_context or AuthContext.dev()
        return self._repository.list(org_id=auth_context.org_id)

    async def publish_campaign(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
    ) -> CampaignProposal:
        auth_context = auth_context or AuthContext.dev()
        campaign = self.get_campaign(campaign_id, auth_context)
        if campaign.publish_result is not None:
            return campaign
        if not campaign.metric_snapshots:
            raise CampaignMeasurementRequiredError(campaign_id)
        if not campaign.legal_checks or campaign.legal_checks[-1].status != "passed":
            raise CampaignLegalCheckRequiredError(campaign_id)
        if self._find_pending_publish_action(campaign) is not None:
            return campaign

        action = AgentAction(
            kind="publish_campaign",
            payload={
                "campaign_id": campaign.id,
                "account_id": self._settings.mock_media_account_id,
                "placements": [
                    placement.model_dump(mode="json")
                    for placement in campaign.media_plan.placements
                ],
                "creative": {
                    "headline": campaign.creative.headline,
                    "body": campaign.creative.body,
                    "call_to_action": campaign.creative.call_to_action,
                },
            },
            guardrail_result=self._pending_approval_guardrail_result(campaign),
        )
        campaign.actions.append(action)
        previous_status = campaign.status
        campaign.status = "draft"
        saved = self._repository.save(campaign)
        self._audit_repository.append(
            event_type="campaign.publish.requested",
            org_id=auth_context.org_id,
            actor=auth_context.actor_id,
            subject_type="campaign",
            subject_id=campaign.id,
            summary="Publish action created as pending approval; no media mutation executed.",
            payload={"action_id": action.id, "action_kind": action.kind},
            diff={"status": {"from": previous_status, "to": campaign.status}},
            guardrail_result=action.guardrail_result,
        )
        return saved

    async def approve_action(
        self,
        campaign_id: str,
        action_id: str,
        auth_context: AuthContext | None = None,
    ) -> CampaignProposal:
        auth_context = auth_context or AuthContext.dev()
        ensure_allowed(auth_context, "publish.approve")
        campaign = self.get_campaign(campaign_id, auth_context)
        action = self._get_action(campaign, action_id)
        if action.approval_status != "pending_approval":
            raise AgentActionNotPendingError(action_id)

        previous_status = campaign.status
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
        action.approval_status = "approved"
        action.execution_result = publish_result.model_dump(mode="json")
        campaign.publish_result = publish_result
        campaign.status = publish_result.status
        saved = self._repository.save(campaign)
        self._audit_repository.append(
            event_type="campaign.publish.approved",
            org_id=auth_context.org_id,
            actor=auth_context.actor_id,
            subject_type="campaign",
            subject_id=campaign.id,
            summary="Pending publish action approved and submitted through the media adapter.",
            payload={
                "action_id": action.id,
                "external_campaign_id": publish_result.external_campaign_id,
            },
            diff={
                "status": {"from": previous_status, "to": campaign.status},
                "action": {"approval_status": {"from": "pending_approval", "to": "approved"}},
            },
            guardrail_result=action.guardrail_result,
        )
        return saved

    def reject_action(
        self,
        campaign_id: str,
        action_id: str,
        auth_context: AuthContext | None = None,
    ) -> CampaignProposal:
        auth_context = auth_context or AuthContext.dev()
        ensure_allowed(auth_context, "publish.reject")
        campaign = self.get_campaign(campaign_id, auth_context)
        action = self._get_action(campaign, action_id)
        if action.approval_status != "pending_approval":
            raise AgentActionNotPendingError(action_id)

        action.approval_status = "rejected"
        action.execution_result = {"status": "not_executed"}
        saved = self._repository.save(campaign)
        self._audit_repository.append(
            event_type="campaign.publish.rejected",
            org_id=auth_context.org_id,
            actor=auth_context.actor_id,
            subject_type="campaign",
            subject_id=campaign.id,
            summary="Pending publish action rejected; no media mutation executed.",
            payload={"action_id": action.id},
            diff={"action": {"approval_status": {"from": "pending_approval", "to": "rejected"}}},
            guardrail_result=action.guardrail_result,
        )
        return saved

    async def get_performance(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
    ) -> MediaPerformanceResponse:
        campaign = self.get_campaign(campaign_id, auth_context)
        if campaign.publish_result is None:
            raise CampaignNotPublishedError(campaign_id)

        return await self._media_adapter.get_performance(
            MediaPerformanceRequest(
                account_id=self._settings.mock_media_account_id,
                external_campaign_id=campaign.publish_result.external_campaign_id,
            )
        )

    async def refresh_measurements(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
    ) -> MetricSnapshot:
        auth_context = auth_context or AuthContext.dev()
        campaign = self.get_campaign(campaign_id, auth_context)
        snapshot = await self._measurement_adapter.fetch_snapshot(
            MeasurementReadRequest(
                org_id=auth_context.org_id,
                campaign_id=campaign.id,
                campaign_name=campaign.brief.name,
                total_budget_jpy=campaign.brief.total_budget_jpy,
            )
        )
        campaign.metric_snapshots.append(snapshot)
        self._repository.save(campaign)
        self._audit_repository.append(
            event_type="campaign.measurement.refreshed",
            org_id=auth_context.org_id,
            actor=auth_context.actor_id,
            subject_type="campaign",
            subject_id=campaign.id,
            summary="Read-only GA4/Shopify measurement snapshot refreshed before publish.",
            payload={
                "snapshot_id": snapshot.id,
                "source": snapshot.source,
                "data_kind": snapshot.data_kind,
            },
            guardrail_result={
                "status": "passed",
                "checks": [
                    {
                        "name": "measurement_before_publish",
                        "result": "passed",
                        "message": "Measurement snapshot exists before publish approval.",
                    }
                ],
            },
        )
        return snapshot

    def latest_measurement(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
    ) -> MetricSnapshot | None:
        campaign = self.get_campaign(campaign_id, auth_context)
        if not campaign.metric_snapshots:
            return None
        return campaign.metric_snapshots[-1]

    def run_legal_check(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
    ) -> LegalCheckResult:
        auth_context = auth_context or AuthContext.dev()
        campaign = self.get_campaign(campaign_id, auth_context)
        result = run_rule_based_legal_check(
            texts=[
                campaign.creative.headline,
                campaign.creative.body,
                campaign.creative.call_to_action,
                *campaign.creative.hashtags,
            ]
        )
        campaign.legal_checks.append(result)
        self._repository.save(campaign)
        self._audit_repository.append(
            event_type="campaign.legal_check.completed",
            org_id=auth_context.org_id,
            actor=auth_context.actor_id,
            subject_type="campaign",
            subject_id=campaign.id,
            summary="Rule-based legal check completed for campaign creative.",
            payload={
                "legal_check_id": result.id,
                "status": result.status,
                "finding_count": len(result.findings),
            },
            guardrail_result={
                "status": result.status,
                "checks": [
                    {
                        "name": "legal_check_before_publish",
                        "result": result.status,
                        "message": "Rule-based 薬機法/景表法 check ran before publish.",
                    }
                ],
            },
        )
        return result

    def latest_legal_check(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
    ) -> LegalCheckResult | None:
        campaign = self.get_campaign(campaign_id, auth_context)
        if not campaign.legal_checks:
            return None
        return campaign.legal_checks[-1]

    async def evaluate_kill_switch(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
    ) -> KillSwitchResult:
        auth_context = auth_context or AuthContext.dev()
        ensure_allowed(auth_context, "kill_switch.evaluate")
        campaign = self.get_campaign(campaign_id, auth_context)
        if campaign.publish_result is None:
            result = KillSwitchResult(
                status="clear",
                data_kind="simulated",
                reason="No external campaign is published yet; no real stop action exists.",
                media_status={"external_campaign_id": None, "active": False, "health": "unknown"},
            )
        else:
            media_status = await self._media_adapter.get_delivery_status(
                MediaDeliveryStatusRequest(
                    account_id=self._settings.mock_media_account_id,
                    external_campaign_id=campaign.publish_result.external_campaign_id,
                )
            )
            should_stop = media_status.active and media_status.health in {"degraded", "unknown"}
            result = KillSwitchResult(
                status="would_stop" if should_stop else "clear",
                data_kind=media_status.data_kind,
                reason=(
                    "Mock media status is simulated; no real stop mutation was executed."
                    if media_status.data_kind == "simulated"
                    else "Media status checked through adapter boundary."
                ),
                media_status=media_status.model_dump(mode="json"),
            )

        campaign.kill_switch_results.append(result)
        self._repository.save(campaign)
        self._audit_repository.append(
            event_type="campaign.kill_switch.evaluated",
            org_id=auth_context.org_id,
            actor=auth_context.actor_id,
            subject_type="campaign",
            subject_id=campaign.id,
            summary="Kill Switch evaluated through media status boundary.",
            payload={
                "kill_switch_result_id": result.id,
                "status": result.status,
                "data_kind": result.data_kind,
            },
            guardrail_result={
                "status": result.status,
                "checks": [
                    {
                        "name": "kill_switch_status",
                        "result": result.status,
                        "message": result.reason,
                    }
                ],
            },
        )
        return result

    def latest_kill_switch_result(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
    ) -> KillSwitchResult | None:
        campaign = self.get_campaign(campaign_id, auth_context)
        if not campaign.kill_switch_results:
            return None
        return campaign.kill_switch_results[-1]

    def list_campaign_audit(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
    ) -> list[AuditEntry]:
        auth_context = auth_context or AuthContext.dev()
        self.get_campaign(campaign_id, auth_context)
        return self._audit_repository.list_for_subject(
            "campaign",
            campaign_id,
            org_id=auth_context.org_id,
        )

    def verify_audit(
        self,
        auth_context: AuthContext | None = None,
    ) -> AuditVerificationResult:
        auth_context = auth_context or AuthContext.dev()
        ensure_allowed(auth_context, "audit.verify")
        return self._audit_repository.verify()

    def _creative_from_llm(self, content: str, brief: CampaignBrief) -> CreativeDraft:
        data = json.loads(content)
        return CreativeDraft(
            headline=data["headline"],
            body=data["body"],
            call_to_action=data["call_to_action"],
            hashtags=[f"#{channel}" for channel in brief.channels],
            compliance_notes=["Mock LLM output. Human review required before production use."],
        )

    def _find_pending_publish_action(self, campaign: CampaignProposal) -> AgentAction | None:
        return next(
            (
                action
                for action in campaign.actions
                if action.kind == "publish_campaign"
                and action.approval_status == "pending_approval"
            ),
            None,
        )

    def _get_action(self, campaign: CampaignProposal, action_id: str) -> AgentAction:
        action = next((action for action in campaign.actions if action.id == action_id), None)
        if action is None:
            raise AgentActionNotFoundError(action_id)
        return action

    def _pending_approval_guardrail_result(self, campaign: CampaignProposal) -> dict:
        return {
            "status": "requires_approval",
            "checks": [
                {
                    "name": "human_approval_required",
                    "result": "requires_approval",
                    "message": "Publishing is a media mutation and requires human approval.",
                },
                {
                    "name": "budget_positive",
                    "result": "passed",
                    "message": f"Budget is {campaign.brief.total_budget_jpy} JPY.",
                },
            ],
        }
