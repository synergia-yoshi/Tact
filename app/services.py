from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

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
from app.models.dashboard import (
    CampaignDashboard,
    ChannelDashboardRow,
    DashboardChannelFilter,
    DashboardMetric,
    DashboardPeriod,
    ImprovementCycle,
    KillSwitchDashboardState,
)
from app.models.kill_switch import KillSwitchResult
from app.models.legal import LegalCheckResult
from app.models.measurement import MetricSeriesPoint, MetricSnapshot
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
            summary="広告案を作成しました。広告文と配信先の案はサーバー側で作成されています。",
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
                            "広告文、配信先の案、操作記録をサーバー側で作成しました。"
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

    def get_dashboard(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
        *,
        period: DashboardPeriod = "28d",
        channel_filter: DashboardChannelFilter = "all",
    ) -> CampaignDashboard:
        auth_context = auth_context or AuthContext.dev()
        campaign = self.get_campaign(campaign_id, auth_context)
        metric = self.latest_measurement(campaign_id, auth_context)
        channel_rows = self._dashboard_channel_rows(campaign, metric, period)
        if channel_filter != "all":
            channel_rows = [row for row in channel_rows if row.channel == channel_filter]
        return CampaignDashboard(
            campaign_id=campaign.id,
            campaign_name=campaign.brief.name,
            period=period,
            channel_filter=channel_filter,
            kpis=self._dashboard_kpis(campaign, metric, channel_rows, period),
            channels=channel_rows,
            improvement_cycles=self._improvement_cycles(campaign, metric),
            kill_switch=self._dashboard_kill_switch_state(campaign),
            generated_at=datetime.now(tz=UTC),
        )

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
            summary="広告を出す前の最終確認に登録しました。まだ実際の広告操作は行っていません。",
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
            summary="確認待ちだった広告開始を承認し、テスト用の媒体へ送信しました。",
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
            summary="確認待ちだった広告開始を差し戻しました。実際の広告操作は行っていません。",
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
            summary="広告を出す前に売上・アクセスの数字を確認しました。",
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
                        "message": "広告を出す前に数字の確認結果があります。",
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
            summary="広告文の表現を確認しました。",
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
                        "message": "広告を出す前に薬機法・景表法の簡易チェックを実行しました。",
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
                reason="まだ広告を出していないため、停止対象はありません。",
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
                    "テスト用の媒体状態のため、実際の停止操作は行っていません。"
                    if media_status.data_kind == "simulated"
                    else "媒体の状態を確認しました。"
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
            summary="緊急停止の判定を実行しました。",
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

    async def request_kill_switch_stop(
        self,
        campaign_id: str,
        auth_context: AuthContext | None = None,
    ) -> KillSwitchResult:
        auth_context = auth_context or AuthContext.dev()
        ensure_allowed(auth_context, "kill_switch.stop")
        campaign = self.get_campaign(campaign_id, auth_context)
        if campaign.publish_result is None:
            result = KillSwitchResult(
                status="clear",
                data_kind="simulated",
                reason="まだ広告を出していないため、止める対象はありません。",
                media_status={"external_campaign_id": None, "active": False, "health": "unknown"},
            )
        else:
            media_status = await self._media_adapter.get_delivery_status(
                MediaDeliveryStatusRequest(
                    account_id=self._settings.mock_media_account_id,
                    external_campaign_id=campaign.publish_result.external_campaign_id,
                )
            )
            result = KillSwitchResult(
                status="would_stop",
                data_kind=media_status.data_kind,
                reason=(
                    "テスト用の媒体では止める想定の確認だけを行いました。"
                    "実際の広告停止操作は行っていません。"
                ),
                media_status=media_status.model_dump(mode="json"),
            )

        campaign.kill_switch_results.append(result)
        self._repository.save(campaign)
        self._audit_repository.append(
            event_type="campaign.kill_switch.stop_requested",
            org_id=auth_context.org_id,
            actor=auth_context.actor_id,
            subject_type="campaign",
            subject_id=campaign.id,
            summary="緊急停止の止める想定を確認しました。テスト用のため実停止は行っていません。",
            payload={
                "kill_switch_result_id": result.id,
                "status": result.status,
                "data_kind": result.data_kind,
            },
            diff={
                "kill_switch": {
                    "from": campaign.kill_switch_results[-2].status
                    if len(campaign.kill_switch_results) > 1
                    else None,
                    "to": result.status,
                }
            },
            guardrail_result={
                "status": "requires_approval",
                "checks": [
                    {
                        "name": "kill_switch_stop_authorized",
                        "result": "passed",
                        "message": "止める想定の操作は承認者または管理者だけが実行できます。",
                    },
                    {
                        "name": "simulated_media_no_real_stop",
                        "result": "passed",
                        "message": result.reason,
                    },
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

    def _dashboard_kpis(
        self,
        campaign: CampaignProposal,
        metric: MetricSnapshot | None,
        channel_rows: list[ChannelDashboardRow],
        period: DashboardPeriod,
    ) -> list[DashboardMetric]:
        if metric is None:
            return [
                self._metric(
                    "ad_spend_jpy",
                    "使った広告費",
                    None,
                    "jpy",
                    status="measurement_pending",
                ),
                self._metric(
                    "roas",
                    "費用対効果",
                    None,
                    "ratio",
                    status="measurement_pending",
                ),
                self._metric(
                    "cpa_jpy",
                    "1件あたりの費用",
                    campaign.media_plan.estimated_cpa_jpy,
                    "jpy",
                    data_kind="simulated",
                    source="media_plan_mock",
                    estimate_range=campaign.media_plan.estimated_cpa_jpy_range,
                ),
                self._metric(
                    "conversions",
                    "コンバージョン",
                    None,
                    "count",
                    status="measurement_pending",
                ),
            ]

        spend = sum(row.ad_spend_jpy.value or 0 for row in channel_rows)
        conversions = sum(row.conversions.value or 0 for row in channel_rows)
        revenue = sum(
            (row.roas.value or 0) * (row.ad_spend_jpy.value or 0)
            for row in channel_rows
        )
        cpa = round(spend / conversions, 2) if conversions else None
        roas = round(revenue / spend, 2) if spend else None
        status = "available" if spend and conversions else "measurement_pending"
        series = (
            channel_rows[0].series
            if len(channel_rows) == 1
            else self._filter_series(metric.series.get("conversions", []), period)
        )
        return [
            self._metric(
                "ad_spend_jpy",
                "使った広告費",
                spend,
                "jpy",
                data_kind=metric.data_kind,
                source=metric.source,
            ),
            self._metric(
                "roas",
                "費用対効果",
                roas,
                "ratio",
                status=status,
                data_kind=metric.data_kind,
                source=metric.source,
                estimate_range=metric.roas_range,
            ),
            self._metric(
                "cpa_jpy",
                "1件あたりの費用",
                cpa,
                "jpy",
                status=status,
                data_kind=metric.data_kind,
                source=metric.source,
                estimate_range=metric.cpa_jpy_range,
            ),
            self._metric(
                "conversions",
                "コンバージョン",
                conversions,
                "count",
                data_kind=metric.labels.get("conversions", metric.data_kind),
                source=metric.source,
                estimate_range=metric.conversions_range,
                series=series,
            ),
        ]

    def _dashboard_channel_rows(
        self,
        campaign: CampaignProposal,
        metric: MetricSnapshot | None,
        period: DashboardPeriod,
    ) -> list[ChannelDashboardRow]:
        placements = campaign.media_plan.placements
        total_budget = sum(placement.budget_jpy for placement in placements) or 1
        weights = [placement.budget_jpy / total_budget for placement in placements]
        spend_values = self._allocate_int(metric.ad_spend_jpy, weights) if metric else []
        conversion_values = self._allocate_int(metric.conversions, weights) if metric else []
        revenue_values = self._allocate_int(metric.revenue_jpy, weights) if metric else []
        latest_kill = campaign.kill_switch_results[-1] if campaign.kill_switch_results else None

        rows: list[ChannelDashboardRow] = []
        for index, placement in enumerate(placements):
            planned = self._metric(
                "planned_budget_jpy",
                "配分予算",
                placement.budget_jpy,
                "jpy",
                data_kind="simulated",
                source="media_plan_mock",
            )
            if metric is None:
                rows.append(
                    ChannelDashboardRow(
                        channel=placement.channel,
                        label=self._channel_label(placement.channel),
                        status=self._channel_status(campaign, latest_kill),
                        planned_budget_jpy=planned,
                        ad_spend_jpy=self._metric(
                            "ad_spend_jpy",
                            "使った広告費",
                            None,
                            "jpy",
                            status="measurement_pending",
                        ),
                        roas=self._metric(
                            "roas",
                            "費用対効果",
                            None,
                            "ratio",
                            status="measurement_pending",
                        ),
                        cpa_jpy=self._metric(
                            "cpa_jpy",
                            "1件あたりの費用",
                            None,
                            "jpy",
                            status="measurement_pending",
                        ),
                        conversions=self._metric(
                            "conversions",
                            "コンバージョン",
                            None,
                            "count",
                            status="measurement_pending",
                        ),
                    )
                )
                continue

            spend = spend_values[index]
            conversions = conversion_values[index]
            revenue = revenue_values[index]
            cpa = round(spend / conversions, 2) if conversions else None
            roas = round(revenue / spend, 2) if spend else None
            channel_series = self._scale_series(
                self._filter_series(metric.series.get("conversions", []), period),
                weights[index],
            )
            rows.append(
                ChannelDashboardRow(
                    channel=placement.channel,
                    label=self._channel_label(placement.channel),
                    status=self._channel_status(campaign, latest_kill),
                    planned_budget_jpy=planned,
                    ad_spend_jpy=self._metric(
                        "ad_spend_jpy",
                        "使った広告費",
                        spend,
                        "jpy",
                        data_kind=metric.labels.get("ad_spend_jpy", metric.data_kind),
                        source=metric.source,
                    ),
                    roas=self._metric(
                        "roas",
                        "費用対効果",
                        roas,
                        "ratio",
                        status="available" if roas is not None else "measurement_pending",
                        data_kind=metric.labels.get("roas", metric.data_kind),
                        source=metric.source,
                    ),
                    cpa_jpy=self._metric(
                        "cpa_jpy",
                        "1件あたりの費用",
                        cpa,
                        "jpy",
                        status="available" if cpa is not None else "measurement_pending",
                        data_kind=metric.labels.get("cpa_jpy", metric.data_kind),
                        source=metric.source,
                    ),
                    conversions=self._metric(
                        "conversions",
                        "コンバージョン",
                        conversions,
                        "count",
                        data_kind=metric.labels.get("conversions", metric.data_kind),
                        source=metric.source,
                    ),
                    series=channel_series,
                )
            )
        return rows

    def _improvement_cycles(
        self,
        campaign: CampaignProposal,
        metric: MetricSnapshot | None,
    ) -> list[ImprovementCycle]:
        cycles = [
            ImprovementCycle(
                stage="brief",
                title="宣伝内容を受付",
                changed=f"目的: {campaign.brief.objective}",
                result="広告案の材料として保存しました。",
                source="media_plan_mock",
                data_kind="simulated",
                occurred_at=campaign.created_at,
                evidence_event_type="campaign.proposal.created",
            ),
            ImprovementCycle(
                stage="creative",
                title="広告文と配信案を作成",
                changed=f"{len(campaign.media_plan.placements)}媒体に配分しました。",
                result="公開前の確認に進める案を作成しました。",
                source="media_plan_mock",
                data_kind="simulated",
                occurred_at=campaign.media_plan.generated_at,
                evidence_event_type="campaign.proposal.created",
            ),
        ]
        if metric is not None:
            cycles.append(
                ImprovementCycle(
                    stage="measurement",
                    title="成果を計測",
                    changed="広告費・成果数・費用対効果を確認しました。",
                    result=(
                        f"コンバージョン {metric.conversions}件、"
                        f"費用対効果 {metric.roas:.2f}倍。"
                    ),
                    source=metric.source,
                    data_kind=metric.data_kind,
                    occurred_at=metric.measured_at,
                    evidence_event_type="campaign.measurement.refreshed",
                )
            )
        if campaign.publish_result is not None:
            cycles.append(
                ImprovementCycle(
                    stage="publish",
                    title="配信状態を更新",
                    changed="承認後にテスト用媒体へ送信しました。",
                    result=f"状態: {campaign.publish_result.status}",
                    source="mock_media",
                    data_kind="simulated",
                    occurred_at=campaign.publish_result.submitted_at,
                    evidence_event_type="campaign.publish.approved",
                )
            )
        cycles.append(
            ImprovementCycle(
                stage="improvement",
                title="次の改善案",
                changed="まだありません",
                result="新しい改善案は、実データまたは明示された提案が供給された時だけ表示します。",
                occurred_at=metric.measured_at if metric is not None else campaign.created_at,
            )
        )
        return cycles

    def _dashboard_kill_switch_state(
        self,
        campaign: CampaignProposal,
    ) -> KillSwitchDashboardState:
        if not campaign.kill_switch_results:
            return KillSwitchDashboardState(
                status="not_checked",
                label="確認待ち",
                reason="まだサーバーで緊急停止の状態確認を実行していません。",
            )
        result = campaign.kill_switch_results[-1]
        labels = {
            "clear": "稼働中",
            "would_stop": "停止想定",
            "stopped": "停止",
        }
        return KillSwitchDashboardState(
            status=result.status,
            label=labels[result.status],
            reason=result.reason,
            data_kind=result.data_kind,
            source="mock_media",
            checked_at=result.checked_at,
        )

    def _metric(
        self,
        key: str,
        label: str,
        value: float | None,
        unit: str,
        *,
        status: str = "available",
        data_kind: str | None = None,
        source: str | None = None,
        estimate_range: object | None = None,
        series: list[MetricSeriesPoint] | None = None,
    ) -> DashboardMetric:
        if value is None and status == "available":
            status = "measurement_pending"
        return DashboardMetric(
            key=key,
            label=label,
            value=value,
            unit=unit,
            status=status,
            data_kind=data_kind,
            source=source,
            estimate_range=estimate_range,
            series=series or [],
        )

    def _filter_series(
        self,
        series: list[MetricSeriesPoint],
        period: DashboardPeriod,
    ) -> list[MetricSeriesPoint]:
        if period == "all":
            return series
        days = 7 if period == "7d" else 28
        cutoff = datetime.now(tz=UTC) - timedelta(days=days)
        return [point for point in series if point.timestamp >= cutoff]

    def _scale_series(
        self,
        series: list[MetricSeriesPoint],
        weight: float,
    ) -> list[MetricSeriesPoint]:
        return [
            point.model_copy(
                update={
                    "value": None if point.value is None else round(point.value * weight, 2),
                    "low": None if point.low is None else round(point.low * weight, 2),
                    "high": None if point.high is None else round(point.high * weight, 2),
                }
            )
            for point in series
        ]

    def _allocate_int(self, total: int, weights: list[float]) -> list[int]:
        raw_values = [total * weight for weight in weights]
        values = [int(value) for value in raw_values]
        remainder = total - sum(values)
        order = sorted(
            range(len(weights)),
            key=lambda index: raw_values[index] - values[index],
            reverse=True,
        )
        for index in order[:remainder]:
            values[index] += 1
        return values

    def _channel_status(
        self,
        campaign: CampaignProposal,
        latest_kill: KillSwitchResult | None,
    ) -> str:
        if latest_kill is not None and latest_kill.status in {"would_stop", "stopped"}:
            return "stopped"
        if campaign.publish_result is None:
            return "pending"
        if campaign.publish_result.status in {"scheduled", "published"}:
            return "test"
        return "active"

    def _channel_label(self, channel: str) -> str:
        labels = {
            "search": "検索広告",
            "social": "SNS広告",
            "display": "バナー広告",
        }
        return labels.get(channel, channel)

    def _creative_from_llm(self, content: str, brief: CampaignBrief) -> CreativeDraft:
        data = json.loads(content)
        return CreativeDraft(
            headline=data["headline"],
            body=data["body"],
            call_to_action=data["call_to_action"],
            hashtags=[f"#{channel}" for channel in brief.channels],
            compliance_notes=["テスト用の広告文です。公開前に人の確認が必要です。"],
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
                    "message": "広告を出す操作は媒体側の変更になるため、人の確認が必要です。",
                },
                {
                    "name": "budget_positive",
                    "result": "passed",
                    "message": f"予算は {campaign.brief.total_budget_jpy} 円です。",
                },
            ],
        }
