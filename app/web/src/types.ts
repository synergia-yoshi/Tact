export type Role = "viewer" | "operator" | "approver" | "admin";
export type RouteName =
  | "home"
  | "campaigns"
  | "dashboard"
  | "tasks"
  | "creative"
  | "audit"
  | "roles"
  | "settings";
export type AutonomyLevel = "full_auto" | "approval_only" | "guided";
export type DataKind = "measured" | "simulated";
export type EstimateSource = "mock" | "model" | "measured";
export type MetricSource =
  | "ga4_shopify_mock"
  | "ga4_shopify"
  | "media_plan_mock"
  | "mock_media";

export interface EstimateRange {
  low: number;
  high: number;
  confidence: number | null;
  source: EstimateSource;
}

export interface CampaignBrief {
  name: string;
  objective: string;
  target_audience: string;
  total_budget_jpy: number;
  channels: string[];
  kpis: string[];
  tone: string;
  autonomy_level: AutonomyLevel;
}

export interface CreativeDraft {
  source: "mock" | "model";
  headline: string;
  body: string;
  call_to_action: string;
  hashtags: string[];
  compliance_notes: string[];
}

export interface MediaPlacement {
  channel: string;
  budget_jpy: number;
  objective: string;
  targeting: Record<string, string | string[]>;
  creative_spec: Record<string, string>;
}

export interface MediaPlan {
  request_id: string;
  account_id: string;
  source: "mock" | "model";
  placements: MediaPlacement[];
  estimated_reach: number;
  estimated_reach_range: EstimateRange | null;
  estimated_cpa_jpy: number;
  estimated_cpa_jpy_range: EstimateRange | null;
  generated_at: string;
}

export interface AgentAction {
  id: string;
  kind: "publish_campaign";
  payload: Record<string, unknown>;
  guardrail_result: Record<string, unknown>;
  approval_status: "pending_approval" | "approved" | "rejected";
  execution_result: Record<string, unknown> | null;
  created_at: string;
}

export interface MetricSnapshot {
  id: string;
  source: "ga4_shopify_mock" | "ga4_shopify";
  data_kind: DataKind;
  sessions: number;
  conversions: number;
  orders: number;
  revenue_jpy: number;
  ad_spend_jpy: number;
  cpa_jpy: number;
  cpa_jpy_range: EstimateRange | null;
  roas: number;
  roas_range: EstimateRange | null;
  conversions_range: EstimateRange | null;
  confidence: number;
  labels: Record<string, DataKind>;
  series: Record<string, MetricSeriesPoint[]>;
  measured_at: string;
}

export interface MetricSeriesPoint {
  timestamp: string;
  value: number | null;
  data_kind: DataKind;
  source: MetricSource;
  low: number | null;
  high: number | null;
}

export interface LegalCheckResult {
  id: string;
  source: string;
  status: "passed" | "needs_review" | "blocked";
  findings: unknown[];
  checked_at: string;
}

export interface PublishResult {
  request_id: string;
  external_campaign_id: string;
  status: "draft" | "scheduled" | "published" | "failed";
  review_url: string | null;
  submitted_at: string;
}

export interface KillSwitchResult {
  id: string;
  status: "clear" | "would_stop" | "stopped";
  data_kind: DataKind;
  reason: string;
  media_status: Record<string, unknown>;
  checked_at: string;
}

export interface CampaignProposal {
  id: string;
  org_id: string;
  created_by: string;
  brief: CampaignBrief;
  creative: CreativeDraft;
  media_plan: MediaPlan;
  metric_snapshots: MetricSnapshot[];
  legal_checks: LegalCheckResult[];
  kill_switch_results: KillSwitchResult[];
  actions: AgentAction[];
  publish_result: PublishResult | null;
  status: "proposed" | "draft" | "scheduled" | "published" | "failed";
  created_at: string;
}

export type DashboardPeriod = "7d" | "28d" | "all";
export type DashboardChannelFilter = "all" | "search" | "social" | "display";

export interface DashboardMetric {
  key:
    | "planned_budget_jpy"
    | "ad_spend_jpy"
    | "roas"
    | "cpa_jpy"
    | "conversions"
    | "revenue_jpy";
  label: string;
  value: number | null;
  unit: "jpy" | "ratio" | "count";
  status: "available" | "measurement_pending" | "not_applicable";
  data_kind: DataKind | null;
  source: MetricSource | null;
  estimate_range: EstimateRange | null;
  series: MetricSeriesPoint[];
}

export interface ChannelDashboardRow {
  channel: string;
  label: string;
  status: "pending" | "active" | "stopped" | "test";
  planned_budget_jpy: DashboardMetric;
  ad_spend_jpy: DashboardMetric;
  roas: DashboardMetric;
  cpa_jpy: DashboardMetric;
  conversions: DashboardMetric;
  series: MetricSeriesPoint[];
}

export interface ImprovementCycle {
  stage: "brief" | "creative" | "measurement" | "publish" | "improvement";
  title: string;
  changed: string;
  result: string;
  source: MetricSource | null;
  data_kind: DataKind | null;
  occurred_at: string;
  evidence_event_type: string | null;
}

export interface KillSwitchDashboardState {
  status: "not_checked" | "clear" | "would_stop" | "stopped";
  label: string;
  reason: string;
  data_kind: DataKind | null;
  source: MetricSource | null;
  checked_at: string | null;
}

export interface CampaignDashboard {
  campaign_id: string;
  campaign_name: string;
  period: DashboardPeriod;
  channel_filter: DashboardChannelFilter;
  kpis: DashboardMetric[];
  channels: ChannelDashboardRow[];
  improvement_cycles: ImprovementCycle[];
  kill_switch: KillSwitchDashboardState;
  generated_at: string;
}

export interface AuditEntry {
  id: string;
  event_type: string;
  actor: string;
  summary: string;
  hash: string;
  prev_hash: string | null;
  created_at: string;
}

export interface AuditVerificationResult {
  valid: boolean;
  entries_checked: number;
  broken_entry_id: string | null;
  reason: string | null;
}

export interface DevTokenResponse {
  token: string | null;
  actor_id: string;
  org_id: string;
  roles: Role[];
  expires_at: string | null;
  auth_mode: string;
}

export interface RoleAssignment {
  actor_id: string;
  display_name: string;
  roles: Role[];
  surface: string;
  updated_at: string;
}

export interface UiError {
  status: number;
  message: string;
  detail: string;
}
