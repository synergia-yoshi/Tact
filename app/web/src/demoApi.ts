import type {
  AgentAction,
  AuditEntry,
  AuditVerificationResult,
  CampaignBrief,
  CampaignDashboard,
  CampaignProposal,
  ChannelDashboardRow,
  DashboardChannelFilter,
  DashboardMetric,
  DashboardPeriod,
  DataKind,
  DevTokenResponse,
  EstimateRange,
  KillSwitchDashboardState,
  KillSwitchResult,
  LegalCheckResult,
  MetricSeriesPoint,
  MetricSnapshot,
  MetricSource,
  Role,
  RoleAssignment,
  UiError,
} from "./types";

const demoLatencyMs = 80;
const orgId = "demo-org";
const actorByRole: Record<Role, { actor_id: string; display_name: string }> = {
  viewer: { actor_id: "demo-viewer", display_name: "デモ閲覧者" },
  approver: { actor_id: "demo-approver", display_name: "デモ承認者" },
  operator: { actor_id: "demo-operator", display_name: "デモ担当者" },
  admin: { actor_id: "demo-admin", display_name: "デモ管理者" },
};

let currentRole: Role = "operator";
let campaigns: CampaignProposal[] = [];
let auditEntries: AuditEntry[] = [];
let sequence = 1;
let roleAssignments: RoleAssignment[] = [
  roleAssignment("viewer"),
  roleAssignment("approver"),
  roleAssignment("operator"),
  roleAssignment("admin"),
];

export const demoApi = {
  async devToken(role: Role): Promise<DevTokenResponse> {
    currentRole = role;
    const actor = actorByRole[role];
    return respond({
      token: `demo-token-${role}`,
      actor_id: actor.actor_id,
      org_id: orgId,
      roles: [role],
      expires_at: null,
      auth_mode: "signed_bearer",
    });
  },

  async listCampaigns(): Promise<CampaignProposal[]> {
    requireAny(["viewer", "approver", "operator", "admin"], "campaign.read");
    return respond(campaigns.map(scopeCampaignForRole));
  },

  async createProposal(brief: CampaignBrief): Promise<CampaignProposal> {
    requireAny(["operator", "admin"], "campaign.create");
    const campaign = createCampaign(brief);
    campaigns = [campaign, ...campaigns];
    appendAudit("campaign.proposal.created", `${brief.name} のテスト用広告案を作成しました。`);
    return respond(scopeCampaignForRole(campaign));
  },

  async getDashboard(
    campaignId: string,
    period: DashboardPeriod,
    channel: DashboardChannelFilter,
  ): Promise<CampaignDashboard> {
    requireAny(["viewer", "approver", "operator", "admin"], "dashboard.read");
    return respond(buildDashboard(findCampaign(campaignId), period, channel));
  },

  async refreshMeasurements(campaignId: string): Promise<MetricSnapshot> {
    requireAny(["operator", "admin"], "campaign.operate");
    const campaign = findCampaign(campaignId);
    const snapshot = createMetricSnapshot(campaign);
    campaign.metric_snapshots.push(snapshot);
    appendAudit("campaign.measurement.refreshed", "テスト用の成果数字を更新しました。");
    return respond(snapshot);
  },

  async runLegalCheck(campaignId: string): Promise<LegalCheckResult> {
    requireAny(["operator", "admin"], "campaign.operate");
    const campaign = findCampaign(campaignId);
    const result: LegalCheckResult = {
      id: nextId("legal"),
      source: "demo_rules",
      status: "passed",
      findings: [],
      checked_at: nowIso(),
    };
    campaign.legal_checks.push(result);
    appendAudit("campaign.legal_check.passed", "テスト用の表現確認を通過しました。");
    return respond(result);
  },

  async requestPublish(campaignId: string): Promise<CampaignProposal> {
    requireAny(["operator", "admin"], "campaign.operate");
    const campaign = findCampaign(campaignId);
    if (latestMetric(campaign) == null) throw conflict("Measurement snapshot is required");
    if (latestLegal(campaign)?.status !== "passed") throw conflict("Passed legal check is required");
    if (pendingPublishAction(campaign) == null && campaign.publish_result == null) {
      campaign.actions.push(createPublishAction(campaign));
      campaign.status = "scheduled";
      appendAudit("campaign.publish.requested", "広告開始の確認待ちを作成しました。");
    }
    return respond(scopeCampaignForRole(campaign));
  },

  async approveAction(campaignId: string, actionId: string): Promise<CampaignProposal> {
    requireAny(["approver", "admin"], "campaign.approve");
    const campaign = findCampaign(campaignId);
    const action = campaign.actions.find((item) => item.id === actionId);
    if (action == null || action.approval_status !== "pending_approval") {
      throw conflict("Action is not pending approval");
    }
    action.approval_status = "approved";
    action.execution_result = {
      status: "simulated",
      external_campaign_id: `demo-media-${campaign.id}`,
    };
    campaign.publish_result = {
      request_id: `demo-publish-${campaign.id}`,
      external_campaign_id: `demo-media-${campaign.id}`,
      status: "published",
      review_url: null,
      submitted_at: nowIso(),
    };
    campaign.status = "published";
    appendAudit(
      "campaign.publish.approved",
      "確認待ちだった広告開始を承認し、テスト用の媒体へ送信しました。",
    );
    return respond(scopeCampaignForRole(campaign));
  },

  async evaluateKillSwitch(campaignId: string): Promise<KillSwitchResult> {
    requireAny(["operator", "approver", "admin"], "kill_switch.evaluate");
    const campaign = findCampaign(campaignId);
    const result: KillSwitchResult = {
      id: nextId("kill"),
      status: "clear",
      data_kind: "simulated",
      reason: "テスト用の成果数字では停止条件に達していません。",
      media_status: { delivery: "simulated_active" },
      checked_at: nowIso(),
    };
    campaign.kill_switch_results.push(result);
    appendAudit("campaign.kill_switch.evaluated", "Kill Switch の状態をテスト用に確認しました。");
    return respond(result);
  },

  async requestKillSwitchStop(campaignId: string): Promise<KillSwitchResult> {
    requireAny(["approver", "admin"], "kill_switch.stop");
    const campaign = findCampaign(campaignId);
    const result: KillSwitchResult = {
      id: nextId("kill"),
      status: "stopped",
      data_kind: "simulated",
      reason: "テスト用媒体のため、実停止ではなく止める想定を監査に残しました。",
      media_status: { delivery: "simulated_stop_requested" },
      checked_at: nowIso(),
    };
    campaign.kill_switch_results.push(result);
    appendAudit(
      "campaign.kill_switch.stop_requested",
      "緊急停止の止める想定を確認しました。テスト用のため実停止は行っていません。",
    );
    return respond(result);
  },

  async listAudit(campaignId: string): Promise<AuditEntry[]> {
    requireAny(["operator", "admin"], "audit.read");
    findCampaign(campaignId);
    return respond(auditEntries);
  },

  async verifyAudit(): Promise<AuditVerificationResult> {
    requireAny(["admin"], "audit.verify");
    return respond({
      valid: true,
      entries_checked: auditEntries.length,
      broken_entry_id: null,
      reason: null,
    });
  },

  async listRoles(): Promise<RoleAssignment[]> {
    requireAny(["admin"], "role.manage");
    return respond(roleAssignments);
  },

  async updateRole(actorId: string, roles: Role[]): Promise<RoleAssignment> {
    requireAny(["admin"], "role.manage");
    const existing =
      roleAssignments.find((assignment) => assignment.actor_id === actorId) ??
      ({
        actor_id: actorId,
        display_name: actorId,
        roles: ["viewer"],
        surface: "顧客面",
        updated_at: nowIso(),
      } satisfies RoleAssignment);
    const updated: RoleAssignment = {
      ...existing,
      roles,
      surface: surfaceForRoles(roles),
      updated_at: nowIso(),
    };
    roleAssignments = roleAssignments.some((assignment) => assignment.actor_id === actorId)
      ? roleAssignments.map((assignment) =>
          assignment.actor_id === actorId ? updated : assignment,
        )
      : [...roleAssignments, updated];
    appendAudit("role.assignment.updated", `${updated.display_name} のロールを変更しました。`);
    return respond(updated);
  },
};

function createCampaign(brief: CampaignBrief): CampaignProposal {
  const campaignId = nextId("demo-campaign");
  const placements = allocateBudget(brief.total_budget_jpy).map(([channel, budget]) => ({
    channel,
    budget_jpy: budget,
    objective: brief.objective,
    targeting: {
      audience: brief.target_audience,
      mode: "demo",
    },
    creative_spec: {
      headline: `${brief.name} のテスト用訴求`,
      format: "responsive_search_and_social",
    },
  }));
  return {
    id: campaignId,
    org_id: orgId,
    created_by: currentActorId(),
    brief,
    creative: {
      source: "mock",
      headline: `${brief.name}を、はじめての方にもわかりやすく。`,
      body: "特徴、価格、安心材料を短く伝えるテスト用の広告文です。",
      call_to_action: "詳しく見る",
      hashtags: ["#テスト用", "#広告案"],
      compliance_notes: ["テスト用の文面です。実配信前に人が確認します。"],
    },
    media_plan: {
      request_id: `demo-request-${campaignId}`,
      account_id: "demo-account",
      source: "mock",
      placements,
      estimated_reach: Math.max(1200, Math.round(brief.total_budget_jpy / 120)),
      estimated_reach_range: estimateRange(
        Math.round(brief.total_budget_jpy / 180),
        Math.round(brief.total_budget_jpy / 80),
      ),
      estimated_cpa_jpy: Math.max(800, Math.round(brief.total_budget_jpy / 420)),
      estimated_cpa_jpy_range: estimateRange(
        Math.max(600, Math.round(brief.total_budget_jpy / 520)),
        Math.max(1200, Math.round(brief.total_budget_jpy / 330)),
      ),
      generated_at: nowIso(),
    },
    metric_snapshots: [],
    legal_checks: [],
    kill_switch_results: [],
    actions: [],
    publish_result: null,
    status: "proposed",
    created_at: nowIso(),
  };
}

function createMetricSnapshot(campaign: CampaignProposal): MetricSnapshot {
  const budget = campaign.brief.total_budget_jpy;
  const conversions = Math.max(12, Math.round(budget / 18000));
  const revenue = conversions * Math.max(7000, Math.round(budget / 120));
  const spend = Math.round(budget * 0.38);
  const cpa = Math.round(spend / conversions);
  const roas = Math.round((revenue / spend) * 100) / 100;
  return {
    id: nextId("metric"),
    source: "ga4_shopify_mock",
    data_kind: "simulated",
    sessions: Math.max(600, Math.round(budget / 360)),
    conversions,
    orders: conversions,
    revenue_jpy: revenue,
    ad_spend_jpy: spend,
    cpa_jpy: cpa,
    cpa_jpy_range: estimateRange(Math.round(cpa * 0.88), Math.round(cpa * 1.14)),
    roas,
    roas_range: estimateRange(roundRatio(roas * 0.86), roundRatio(roas * 1.12)),
    conversions_range: estimateRange(Math.round(conversions * 0.78), Math.round(conversions * 1.2)),
    confidence: 0.72,
    labels: {
      sessions: "simulated",
      conversions: "simulated",
      revenue_jpy: "simulated",
      ad_spend_jpy: "simulated",
      cpa_jpy: "simulated",
      roas: "simulated",
    },
    series: {
      conversions: series("conversions", conversions),
      ad_spend_jpy: series("ad_spend_jpy", spend),
      revenue_jpy: series("revenue_jpy", revenue),
      cpa_jpy: series("cpa_jpy", cpa),
      roas: series("roas", roas),
    },
    measured_at: nowIso(),
  };
}

function buildDashboard(
  campaign: CampaignProposal,
  period: DashboardPeriod,
  channelFilter: DashboardChannelFilter,
): CampaignDashboard {
  const metric = latestMetric(campaign);
  const channels = campaign.media_plan.placements
    .filter((placement) => channelFilter === "all" || placement.channel === channelFilter)
    .map((placement) => channelRow(placement.channel, placement.budget_jpy, campaign, metric, period));
  return {
    campaign_id: campaign.id,
    campaign_name: campaign.brief.name,
    period,
    channel_filter: channelFilter,
    kpis: [
      dashboardMetric("planned_budget_jpy", "予定予算", campaign.brief.total_budget_jpy, "jpy", "media_plan_mock"),
      dashboardMetric("ad_spend_jpy", "広告費", metric?.ad_spend_jpy ?? null, "jpy", "ga4_shopify_mock"),
      dashboardMetric("roas", "費用対効果", metric?.roas ?? null, "ratio", "ga4_shopify_mock"),
      dashboardMetric("cpa_jpy", "獲得単価", metric?.cpa_jpy ?? null, "jpy", "ga4_shopify_mock"),
      dashboardMetric("conversions", "成果数", metric?.conversions ?? null, "count", "ga4_shopify_mock"),
      dashboardMetric("revenue_jpy", "売上", metric?.revenue_jpy ?? null, "jpy", "ga4_shopify_mock"),
    ],
    channels,
    improvement_cycles: improvementCycles(campaign, metric),
    kill_switch: killSwitchState(campaign),
    generated_at: nowIso(),
  };
}

function channelRow(
  channel: string,
  budget: number,
  campaign: CampaignProposal,
  metric: MetricSnapshot | null,
  period: DashboardPeriod,
): ChannelDashboardRow {
  const share = budget / campaign.brief.total_budget_jpy;
  const conversions = metric == null ? null : Math.max(1, Math.round(metric.conversions * share));
  const spend = metric == null ? null : Math.round(metric.ad_spend_jpy * share);
  const revenue = metric == null ? null : Math.round(metric.revenue_jpy * share);
  const cpa = spend == null || conversions == null ? null : Math.round(spend / conversions);
  const roas = spend == null || revenue == null ? null : roundRatio(revenue / spend);
  return {
    channel,
    label: channelLabel(channel),
    status: metric == null ? "pending" : "test",
    planned_budget_jpy: dashboardMetric("planned_budget_jpy", "予定予算", budget, "jpy", "media_plan_mock"),
    ad_spend_jpy: dashboardMetric("ad_spend_jpy", "広告費", spend, "jpy", "ga4_shopify_mock"),
    roas: dashboardMetric("roas", "費用対効果", roas, "ratio", "ga4_shopify_mock"),
    cpa_jpy: dashboardMetric("cpa_jpy", "獲得単価", cpa, "jpy", "ga4_shopify_mock"),
    conversions: dashboardMetric("conversions", "成果数", conversions, "count", "ga4_shopify_mock"),
    series: scaledSeries(metric?.series.conversions ?? [], share, period),
  };
}

function dashboardMetric(
  key: DashboardMetric["key"],
  label: string,
  value: number | null,
  unit: DashboardMetric["unit"],
  source: MetricSource,
): DashboardMetric {
  return {
    key,
    label,
    value,
    unit,
    status: value == null ? "measurement_pending" : "available",
    data_kind: value == null ? null : "simulated",
    source: value == null ? null : source,
    estimate_range: null,
    series: key === "conversions" && value != null ? series("conversions", value) : [],
  };
}

function improvementCycles(
  campaign: CampaignProposal,
  metric: MetricSnapshot | null,
): CampaignDashboard["improvement_cycles"] {
  return [
    {
      stage: "brief",
      title: "入力内容",
      changed: campaign.brief.name,
      result: "テスト用の広告案に変換しました。",
      source: "media_plan_mock",
      data_kind: "simulated",
      occurred_at: campaign.created_at,
      evidence_event_type: "campaign.proposal.created",
    },
    {
      stage: "creative",
      title: "広告文",
      changed: campaign.creative.headline,
      result: "配信前の確認用に作成しました。",
      source: "media_plan_mock",
      data_kind: "simulated",
      occurred_at: campaign.created_at,
      evidence_event_type: "campaign.proposal.created",
    },
    {
      stage: metric == null ? "measurement" : "improvement",
      title: metric == null ? "成果確認待ち" : "次の改善案",
      changed: metric == null ? "計測を実行すると表示します。" : "成果の良い訴求を残します。",
      result: metric == null ? "まだ数字はありません。" : "テスト用の履歴から判断しています。",
      source: metric == null ? null : "ga4_shopify_mock",
      data_kind: metric == null ? null : "simulated",
      occurred_at: metric?.measured_at ?? campaign.created_at,
      evidence_event_type: metric == null ? null : "campaign.measurement.refreshed",
    },
  ];
}

function killSwitchState(campaign: CampaignProposal): KillSwitchDashboardState {
  const latest = campaign.kill_switch_results[campaign.kill_switch_results.length - 1];
  if (latest == null) {
    return {
      status: "not_checked",
      label: "確認待ち",
      reason: "状態を確認すると、テスト用の停止判断を表示します。",
      data_kind: null,
      source: null,
      checked_at: null,
    };
  }
  return {
    status: latest.status,
    label: latest.status === "stopped" ? "停止想定" : "問題なし",
    reason: latest.reason,
    data_kind: latest.data_kind,
    source: "mock_media",
    checked_at: latest.checked_at,
  };
}

function createPublishAction(campaign: CampaignProposal): AgentAction {
  return {
    id: nextId("action"),
    kind: "publish_campaign",
    payload: {
      media_plan_id: campaign.media_plan.request_id,
      mode: "demo",
    },
    guardrail_result: {
      status: "passed",
      data_kind: "simulated",
    },
    approval_status: "pending_approval",
    execution_result: null,
    created_at: nowIso(),
  };
}

function scopeCampaignForRole(campaign: CampaignProposal): CampaignProposal {
  const copy = clone(campaign);
  if (currentRole === "operator" || currentRole === "admin") return copy;
  copy.media_plan.request_id = "redacted";
  copy.media_plan.account_id = "redacted";
  copy.media_plan.placements = copy.media_plan.placements.map((placement) => ({
    ...placement,
    targeting: {},
    creative_spec: {},
  }));
  copy.actions = copy.actions.map((action) => ({
    ...action,
    payload: {},
    guardrail_result: { status: action.guardrail_result.status ?? "redacted" },
    execution_result: null,
  }));
  return copy;
}

function roleAssignment(role: Role): RoleAssignment {
  const actor = actorByRole[role];
  return {
    actor_id: actor.actor_id,
    display_name: actor.display_name,
    roles: [role],
    surface: surfaceForRoles([role]),
    updated_at: nowIso(),
  };
}

function requireAny(allowed: Role[], operation: string): void {
  if (allowed.includes(currentRole)) return;
  throw forbidden(operation, allowed);
}

function forbidden(operation: string, allowed: Role[]): UiError {
  return {
    status: 403,
    detail: `${operation} requires ${allowed.join(", ")}`,
    message: "この操作を実行する権限がありません。ロールを切り替えてください。",
  };
}

function conflict(detail: string): UiError {
  return {
    status: 409,
    detail,
    message: "操作の前提条件が満たされていません。最新状態を確認してください。",
  };
}

function findCampaign(campaignId: string): CampaignProposal {
  const campaign = campaigns.find((item) => item.id === campaignId);
  if (campaign != null) return campaign;
  throw {
    status: 404,
    detail: "Campaign not found",
    message: "対象の広告案が見つかりません。",
  } satisfies UiError;
}

function pendingPublishAction(campaign: CampaignProposal): AgentAction | null {
  return (
    campaign.actions.find(
      (action) =>
        action.kind === "publish_campaign" && action.approval_status === "pending_approval",
    ) ?? null
  );
}

function latestMetric(campaign: CampaignProposal): MetricSnapshot | null {
  return campaign.metric_snapshots[campaign.metric_snapshots.length - 1] ?? null;
}

function latestLegal(campaign: CampaignProposal): LegalCheckResult | null {
  return campaign.legal_checks[campaign.legal_checks.length - 1] ?? null;
}

function appendAudit(eventType: string, summary: string): void {
  const prev = auditEntries[auditEntries.length - 1]?.hash ?? null;
  const hash = `demo-hash-${sequence}-${prev ?? "root"}`;
  auditEntries = [
    ...auditEntries,
    {
      id: nextId("audit"),
      event_type: eventType,
      actor: currentActorId(),
      summary,
      hash,
      prev_hash: prev,
      created_at: nowIso(),
    },
  ];
}

function allocateBudget(total: number): Array<[string, number]> {
  const search = Math.round(total * 0.45);
  const social = Math.round(total * 0.35);
  return [
    ["search", search],
    ["social", social],
    ["display", total - search - social],
  ];
}

function estimateRange(low: number, high: number): EstimateRange {
  return {
    low,
    high,
    confidence: 0.72,
    source: "mock",
  };
}

function series(key: DashboardMetric["key"] | keyof MetricSnapshot["series"], total: number): MetricSeriesPoint[] {
  const today = new Date();
  return Array.from({ length: 10 }, (_, index) => {
    const timestamp = new Date(today);
    timestamp.setDate(today.getDate() - (9 - index));
    const missing = index === 3;
    const slope = 0.58 + index * 0.055;
    const value = missing ? null : roundMetric(key, total * slope);
    return {
      timestamp: timestamp.toISOString(),
      value,
      data_kind: "simulated" satisfies DataKind,
      source: "ga4_shopify_mock",
      low: value == null ? null : roundMetric(key, value * 0.88),
      high: value == null ? null : roundMetric(key, value * 1.12),
    };
  });
}

function scaledSeries(
  points: MetricSeriesPoint[],
  share: number,
  period: DashboardPeriod,
): MetricSeriesPoint[] {
  const scoped = period === "7d" ? points.slice(-7) : points;
  return scoped.map((point) => ({
    ...point,
    value: point.value == null ? null : Math.max(1, Math.round(point.value * share)),
    low: point.low == null ? null : Math.max(1, Math.round(point.low * share)),
    high: point.high == null ? null : Math.max(1, Math.round(point.high * share)),
  }));
}

function roundMetric(key: string, value: number): number {
  if (key === "roas") return roundRatio(value);
  return Math.max(1, Math.round(value));
}

function roundRatio(value: number): number {
  return Math.round(value * 100) / 100;
}

function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    search: "検索広告",
    social: "SNS広告",
    display: "バナー広告",
  };
  return labels[channel] ?? channel;
}

function surfaceForRoles(roles: Role[]): string {
  if (roles.includes("admin")) return "管理面";
  if (roles.includes("operator")) return "運用面";
  return "顧客面";
}

function currentActorId(): string {
  return actorByRole[currentRole].actor_id;
}

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pause(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, demoLatencyMs);
  });
}

async function respond<T>(value: T): Promise<T> {
  await pause();
  return clone(value);
}
