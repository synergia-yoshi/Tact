import Chart from "chart.js/auto";
import "./styles.css";
import { api, setBearerToken } from "./api";
import { escapeHtml, safeAttr } from "./escape";
import {
  activeCampaign,
  getState,
  setState,
  subscribe,
  upsertCampaign,
} from "./store";
import type {
  AgentAction,
  AutonomyLevel,
  CampaignBrief,
  CampaignProposal,
  EstimateRange,
  LegalCheckResult,
  MetricSnapshot,
  Role,
  RouteName,
  UiError,
} from "./types";
import type { AppState, LoadingOperation, LoadingState } from "./store";

const routes: Array<{ id: RouteName; label: string; icon: string }> = [
  { id: "home", label: "ホーム", icon: '<path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />' },
  { id: "campaigns", label: "広告案", icon: '<rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" />' },
  { id: "dashboard", label: "成果", icon: '<path d="M4 19V5" /><path d="M4 19h16" /><path d="m8 15 3-4 3 2 4-7" />' },
  { id: "tasks", label: "確認待ち", icon: '<path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />' },
  { id: "creative", label: "広告素材", icon: '<rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="m21 15-5-5L5 21" />' },
  { id: "audit", label: "記録", icon: '<path d="M12 3 4 7v6c0 5 8 8 8 8s8-3 8-8V7l-8-4Z" /><path d="m9 12 2 2 4-4" />' },
  { id: "settings", label: "設定", icon: '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 1.6V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />' },
];

let chart: Chart | null = null;
let chartSignature: string | null = null;
let lastFocusedBeforeModal: HTMLElement | null = null;
const viewSignatures = new Map<string, string>();

type DataIntegrationStatus = "unconnected" | "connected" | "test" | "error";

interface DataIntegration {
  key: string;
  name: string;
  purpose: string;
  status: DataIntegrationStatus;
}

const dataIntegrations: DataIntegration[] = [
  {
    key: "ga4",
    name: "Googleアナリティクス（GA4）",
    purpose: "広告後の訪問数と成果を確認します。",
    status: "test",
  },
  {
    key: "shopify",
    name: "Shopify",
    purpose: "注文数と売上を確認します。",
    status: "test",
  },
  {
    key: "google_ads",
    name: "Google広告",
    purpose: "広告アカウントへの送信先を管理します。",
    status: "test",
  },
];

function el<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element == null) throw new Error(`Missing element #${id}`);
  return element as T;
}

function renderNav(): void {
  el("nav-list").innerHTML = routes
    .map(
      (route) => `
        <button class="nav-item" type="button" data-route="${safeAttr(route.id)}" aria-label="${safeAttr(route.label)}">
          <svg viewBox="0 0 24 24" aria-hidden="true">${route.icon}</svg>
          <span>${escapeHtml(route.label)}</span>
        </button>
      `,
    )
    .join("");
}

function setRoute(route: RouteName): void {
  setState({ route, error: null });
  if (route === "audit") void loadAudit();
}

function render(): void {
  const state = getState();
  renderShell(state);
  renderToast(state.error);
  renderHomeControls(state);
  renderIfChanged("home-stepper", generationSignature(state), renderHomeStepper);
  renderIfChanged("campaigns", campaignsSignature(state), renderCampaigns);
  renderIfChanged("creative", campaignViewSignature(state, ["runPublishGate"]), renderCreative);
  renderIfChanged("tasks", campaignViewSignature(state, ["approveAction"]), renderTasks);
  renderIfChanged("dashboard", dashboardSignature(), renderDashboard);
  renderIfChanged("audit", auditSignature(state), renderAudit);
  renderIfChanged("settings", settingsSignature(state), renderSettings);
}

function renderShell(state: AppState): void {
  document.querySelectorAll<HTMLElement>(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `view-${state.route}`);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-route]").forEach((button) => {
    const active = button.dataset.route === state.route;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  el("page-title").textContent = routes.find((route) => route.id === state.route)?.label ?? "Tact";
  el("role-label").textContent = roleLabel(state.role);
  el("role-avatar").textContent = roleLabel(state.role).slice(0, 1);
  el("auth-mode-label").textContent = authModeLabel(state);
  el("server-label").textContent = serverLabel(state);

  const roleSwitcher = el<HTMLElement>("role-switcher");
  roleSwitcher.hidden = state.devTokenAvailable !== true;
  document.querySelectorAll<HTMLButtonElement>(".role-button").forEach((button) => {
    const role = button.dataset.role as Role | undefined;
    const active = role === state.role;
    const busy = isLoading("switchRole", role);
    button.classList.toggle("active", active);
    button.disabled = state.loading != null || state.devTokenAvailable !== true;
    button.innerHTML = busy ? `${spinner()} 切替中` : escapeHtml(role == null ? "" : roleLabel(role));
  });

  const verifyButton = el<HTMLButtonElement>("verify-audit-button");
  verifyButton.disabled = state.loading != null || state.role !== "admin";
  verifyButton.innerHTML = isLoading("verifyAudit")
    ? `${spinner()} 検証中...`
    : "記録を検証";
}

function authModeLabel(state: AppState): string {
  if (state.devTokenAvailable === false) return "本番モード";
  if (state.auth?.auth_mode === "signed_bearer") return "確認済み";
  if (state.auth?.auth_mode === "disabled") return "この端末で確認中";
  return "確認中";
}

function serverLabel(state: AppState): string {
  if (state.devTokenAvailable === false) return "本番モード";
  if (state.auth?.auth_mode === "signed_bearer") return "安全な確認モード";
  if (state.auth?.auth_mode === "disabled") return "この端末で確認中";
  return "接続確認中";
}

function roleLabel(role: Role): string {
  if (role === "approver") return "承認者";
  if (role === "admin") return "管理者";
  return "担当者";
}

function renderIfChanged(key: string, signature: string, renderer: () => void): void {
  if (viewSignatures.get(key) === signature) return;
  viewSignatures.set(key, signature);
  renderer();
}

function campaignsSignature(state: AppState): string {
  return JSON.stringify({
    campaigns: state.campaigns,
    loading: state.loading,
    failedOperation: state.failedOperation,
  });
}

function campaignViewSignature(
  state: AppState,
  operations: LoadingOperation[],
): string {
  return JSON.stringify({
    campaign: activeOrLatest(),
    loading: state.loading,
    focusedLoading: loadingSignature(state, operations),
    failedOperation: state.failedOperation,
    devTokenAvailable: state.devTokenAvailable,
  });
}

function dashboardSignature(): string {
  return JSON.stringify({
    campaign: activeOrLatest(),
  });
}

function auditSignature(state: AppState): string {
  return JSON.stringify({
    campaignId: activeOrLatest()?.id ?? null,
    entries: state.auditEntries,
    verification: state.auditVerification,
    loading: loadingSignature(state, ["loadAudit", "verifyAudit"]),
    failedOperation: state.failedOperation,
    role: state.role,
  });
}

function generationSignature(state: AppState): string {
  return JSON.stringify({
    campaign: activeOrLatest(),
    loading: state.loading,
    failedOperation: state.failedOperation,
    route: state.route,
  });
}

function settingsSignature(state: AppState): string {
  return JSON.stringify({
    authMode: state.auth?.auth_mode ?? null,
    devTokenAvailable: state.devTokenAvailable,
    role: state.role,
    loading: state.loading?.operation ?? null,
  });
}

function loadingSignature(state: AppState, operations: LoadingOperation[]): string {
  if (state.loading == null || !operations.includes(state.loading.operation)) return "";
  return JSON.stringify(state.loading);
}

function isLoading(operation: LoadingOperation, targetIdOrRole?: string): boolean {
  const loading = getState().loading;
  if (loading == null || loading.operation !== operation) return false;
  if (targetIdOrRole == null) return true;
  return loading.targetId === targetIdOrRole || loading.role === targetIdOrRole;
}

function renderHomeControls(state: AppState): void {
  const busy = isLoading("createCampaign");
  const disabled = state.loading != null || state.devTokenAvailable !== true;
  el<HTMLFormElement>("campaign-form")
    .querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input")
    .forEach((control) => {
      control.disabled = disabled;
    });
  el<HTMLButtonElement>("create-button").innerHTML = busy
    ? `${spinner()} 作成中...`
    : `広告案を作成する ${arrowIcon()}`;
}

function renderHomeStepper(): void {
  el("generation-stepper-content").innerHTML = generationStepper(activeOrLatest());
}

type GenerationStepStatus = "pending" | "running" | "complete" | "failed" | "active";

interface GenerationStep {
  id: string;
  label: string;
  detail: string;
  status: GenerationStepStatus;
  route: RouteName | null;
}

function generationStepper(campaign: CampaignProposal | null): string {
  const steps = generationSteps(campaign);
  return `
    <section class="generation-stepper" aria-label="作成の流れ">
      ${steps.map(stepButton).join("")}
    </section>
  `;
}

function generationSteps(campaign: CampaignProposal | null): GenerationStep[] {
  const loading = getState().loading;
  const failed = getState().failedOperation;
  const pending = campaign == null ? null : pendingPublishAction(campaign);
  const metric = campaign == null ? null : latestMetric(campaign);
  const legal = campaign == null ? null : latestLegalCheck(campaign);
  const published = campaign?.publish_result != null;
  const gateComplete = pending != null || published;

  return [
    {
      id: "brief",
      label: "宣伝内容の入力",
      detail: campaign == null ? "3問に答える" : campaign.brief.name,
      status: statusFor({
        complete: campaign != null,
        running: loading?.operation === "createCampaign",
        failed: failed?.operation === "createCampaign",
        active: campaign == null,
      }),
      route: "home",
    },
    {
      id: "plan",
      label: "出し先と予算の案",
      detail:
        campaign == null
          ? "作成結果待ち"
          : "案を作成済み",
      status: statusFor({
        complete: campaign?.media_plan != null,
        running: loading?.operation === "createCampaign",
        failed: failed?.operation === "createCampaign",
      }),
      route: campaign == null ? null : "creative",
    },
    {
      id: "creative",
      label: "広告文の案",
      detail: campaign == null ? "作成結果待ち" : campaign.creative.headline,
      status: statusFor({
        complete: campaign?.creative != null,
        running: loading?.operation === "createCampaign",
        failed: failed?.operation === "createCampaign",
      }),
      route: campaign == null ? null : "creative",
    },
    {
      id: "gate",
      label: "出す前の確認",
      detail: gateDetail(metric, legal, pending),
      status: statusFor({
        complete: gateComplete,
        running: loading?.operation === "runPublishGate",
        failed: failed?.operation === "runPublishGate",
        active: campaign != null && !gateComplete,
      }),
      route: campaign == null ? null : "creative",
    },
    {
      id: "approval",
      label: "最終確認",
      detail: published ? "確認済み" : pending == null ? "チェック後に表示" : "確認待ち",
      status: statusFor({
        complete: pending != null || published,
        running: loading?.operation === "approveAction",
        failed: failed?.operation === "approveAction",
      }),
      route: pending == null && !published ? null : "tasks",
    },
  ];
}

function statusFor(flags: {
  complete?: boolean;
  running?: boolean;
  failed?: boolean;
  active?: boolean;
}): GenerationStepStatus {
  if (flags.failed) return "failed";
  if (flags.running) return "running";
  if (flags.complete) return "complete";
  if (flags.active) return "active";
  return "pending";
}

function gateDetail(
  metric: MetricSnapshot | null,
  legal: { status: string } | null,
  pending: AgentAction | null,
): string {
  const loading = getState().loading;
  if (loading?.operation === "runPublishGate") {
    if (loading.phase === "legal") return "数字の確認完了 / 表現を確認中";
    if (loading.phase === "publish_request") return "表現の確認完了 / 最終確認へ登録中";
    return "数字を確認中";
  }
  if (pending != null) return "最終確認に登録済み";
  if (metric != null && legal?.status === "passed") return "数字・表現とも問題なし";
  if (metric != null) return "数字確認済み / 表現の確認待ち";
  return "数字・表現の確認待ち";
}

function stepButton(step: GenerationStep, index: number): string {
  const interactive = step.route != null && step.status !== "pending";
  const ariaCurrent =
    step.status === "running" || step.status === "active" ? ` aria-current="step"` : "";
  const disabled = interactive ? "" : " disabled";
  const routeAttr = step.route == null ? "" : ` data-route="${safeAttr(step.route)}"`;
  return `
    <button class="generation-step ${safeAttr(step.status)}" type="button"${routeAttr}${disabled}${ariaCurrent}>
      <span class="generation-index">${escapeHtml(String(index + 1))}</span>
      <span class="generation-copy">
        <b>${escapeHtml(step.label)}</b>
        <small>${escapeHtml(step.detail)}</small>
      </span>
      <span class="generation-status">${statusLabel(step.status)}</span>
    </button>
  `;
}

function statusLabel(status: GenerationStepStatus): string {
  if (status === "complete") return "完了";
  if (status === "running") return "進行中";
  if (status === "failed") return "失敗";
  if (status === "active") return "現在";
  return "未着手";
}

function legalStatusLabel(status: string): string {
  if (status === "passed") return "問題なし";
  if (status === "needs_review") return "要確認";
  if (status === "blocked") return "停止";
  return status;
}

function approvalStatusLabel(status: AgentAction["approval_status"]): string {
  if (status === "approved") return "確認済み";
  if (status === "rejected") return "差し戻し";
  return "確認待ち";
}

function agentProgressPanel(campaign: CampaignProposal): string {
  const items = agentProgressItems(campaign);
  return `
    <section class="agent-progress" aria-label="作業の進行">
      <div class="agent-progress-head">
        <div>
          <p class="eyebrow">進行状況</p>
          <h3>実際に終わった作業だけ表示</h3>
        </div>
        <span class="data-label pending">見せかけなし</span>
      </div>
      <div class="agent-progress-grid">
        ${items.map(agentProgressItem).join("")}
      </div>
    </section>
  `;
}

interface AgentProgressItem {
  title: string;
  body: string;
  status: GenerationStepStatus;
}

function agentProgressItems(campaign: CampaignProposal): AgentProgressItem[] {
  const loading = getState().loading;
  const failed = getState().failedOperation;
  const metric = latestMetric(campaign);
  const legal = latestLegalCheck(campaign);
  const pending = pendingPublishAction(campaign);

  return [
    {
      title: "宣伝内容の受付",
      body: campaign.brief.name,
      status: statusFor({ complete: true }),
    },
    {
      title: "出し先と予算",
      body: `案を作成済み / ${outputSourceLabel(campaign.media_plan.source)}`,
      status: statusFor({
        complete: campaign.media_plan != null,
        failed: failed?.operation === "createCampaign",
      }),
    },
    {
      title: "広告文の案",
      body: `案を作成済み / ${outputSourceLabel(campaign.creative.source)}`,
      status: statusFor({
        complete: campaign.creative != null,
        failed: failed?.operation === "createCampaign",
      }),
    },
    {
      title: "数字の確認",
      body: metric == null ? "まだです" : `確認済み / ${dataLabel(metric.data_kind)}`,
      status: statusFor({
        complete: metric != null,
        running: loading?.operation === "runPublishGate" && loading.phase === "measurement",
        failed: failed?.operation === "runPublishGate" && failed.phase === "measurement",
      }),
    },
    {
      title: "表現の確認",
      body: legal == null ? "まだです" : legalStatusLabel(legal.status),
      status: statusFor({
        complete: legal?.status === "passed",
        running: loading?.operation === "runPublishGate" && loading.phase === "legal",
        failed: failed?.operation === "runPublishGate" && failed.phase === "legal",
      }),
    },
    {
      title: "最終確認",
      body: pending == null ? "まだ確認待ちに入っていません" : approvalStatusLabel(pending.approval_status),
      status: statusFor({
        complete: pending != null || campaign.publish_result != null,
        running: loading?.operation === "runPublishGate" && loading.phase === "publish_request",
        failed: failed?.operation === "runPublishGate" && failed.phase === "publish_request",
      }),
    },
  ];
}

function agentProgressItem(item: AgentProgressItem): string {
  return `
    <article class="agent-progress-item ${safeAttr(item.status)}">
      <span class="agent-dot" aria-hidden="true"></span>
      <div>
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.body)}</p>
      </div>
      <span class="generation-status">${statusLabel(item.status)}</span>
    </article>
  `;
}

function renderToast(error: UiError | null): void {
  const toast = el("toast");
  if (error == null) {
    toast.hidden = true;
    toast.textContent = "";
    return;
  }
  toast.hidden = false;
  toast.textContent = error.message;
}

function activeOrLatest(): CampaignProposal | null {
  return activeCampaign() ?? getState().campaigns[0] ?? null;
}

function renderCampaigns(): void {
  const campaigns = getState().campaigns;
  const content = el("campaigns-content");
  if (campaigns.length === 0) {
    content.innerHTML = emptyState("まだ広告案がありません", "ホームから3問に答えると、作成された広告案だけがここに表示されます。");
    return;
  }
  content.innerHTML = `<div class="card-grid">${campaigns.map(campaignCard).join("")}</div>`;
}

function campaignCard(campaign: CampaignProposal): string {
  const latest = latestMetric(campaign);
  const status = campaign.publish_result == null ? "確認前" : "広告中";
  const statusClass = campaign.publish_result == null ? "pending" : "forecast";
  const cpa = formatEstimate(
    campaign.media_plan.estimated_cpa_jpy,
    campaign.media_plan.estimated_cpa_jpy_range,
    "yen",
  );
  return `
    <article class="campaign-card">
      <span class="data-label ${statusClass}">${escapeHtml(status)}</span>
      <h3>${escapeHtml(campaign.brief.name)}</h3>
      <p>${escapeHtml(campaign.creative.headline)}</p>
      <div class="kpi-row">
        ${metricCell("1件あたり費用の目安", cpa.value, cpa.sub)}
        ${metricCell("費用対効果", latest ? `${latest.roas.toFixed(2)}倍` : "計測待ち", latest ? dataLabel(latest.data_kind) : "未計測")}
      </div>
      <button class="btn ghost card-action" type="button" data-select-campaign="${safeAttr(campaign.id)}">開く</button>
    </article>
  `;
}

function renderCreative(): void {
  const campaign = activeOrLatest();
  const content = el("creative-content");
  if (campaign == null) {
    content.innerHTML = emptyState("広告案はまだありません", "ホームから3問に答えると、広告文と配信先の案を作成します。");
    return;
  }
  const gateBusy = isLoading("runPublishGate", campaign.id);
  const actionDisabled = getState().loading != null || getState().devTokenAvailable !== true;
  const reach = formatEstimate(
    campaign.media_plan.estimated_reach,
    campaign.media_plan.estimated_reach_range,
    "count",
  );
  const cpa = formatEstimate(
    campaign.media_plan.estimated_cpa_jpy,
    campaign.media_plan.estimated_cpa_jpy_range,
    "yen",
  );
  const creativeSource = outputSourceLabel(campaign.creative.source);
  const mediaSource = outputSourceLabel(campaign.media_plan.source);
  content.innerHTML = `
    ${generationStepper(campaign)}
    ${agentProgressPanel(campaign)}
    <div class="creative-grid">
      <article class="copy-card">
        <span class="segment">${escapeHtml(creativeSource)} / 広告文</span>
        <strong>${escapeHtml(campaign.creative.headline)}</strong>
        <p>${escapeHtml(campaign.creative.body)}</p>
        <div class="copy-cta">${escapeHtml(campaign.creative.call_to_action)}</div>
      </article>
      <article class="mock-banner">
        <span>広告プレビュー</span>
        <strong>${escapeHtml(campaign.creative.headline)}</strong>
        <small>作成済み / 出す前の確認</small>
      </article>
    </div>
    <div class="out in">
      <h3>配信先と予算 <span class="data-label forecast">${escapeHtml(mediaSource)}</span></h3>
      ${campaign.media_plan.placements.map(placementRow).join("")}
    </div>
    <div class="out in">
      <h3>成果の目安 <span class="data-label forecast">予測 / テスト用</span></h3>
      <div class="kpi-row">
        ${metricCell("届く人数の目安", reach.value, reach.sub)}
        ${metricCell("1件あたり費用の目安", cpa.value, cpa.sub)}
      </div>
    </div>
    ${gateBusy ? loadingPanel("数字と表現を確認中...") : ""}
    <div class="action-row">
      <p>広告を出す前に、数字と表現を確認してから最終確認へ進みます。</p>
      <div class="action-cluster">
        <button class="btn ghost" type="button" data-route="home">入力に戻る</button>
        <button class="btn ghost" type="button" data-retry-campaign="${safeAttr(campaign.id)}">別案を作る</button>
        <button class="btn primary" type="button" data-start-gate="${safeAttr(campaign.id)}" ${actionDisabled ? "disabled" : ""}>
          ${gateBusy ? `${spinner()} 処理中...` : "出す前の確認へ進む"}
        </button>
      </div>
    </div>
  `;
}

function placementRow(placement: { channel: string; budget_jpy: number }): string {
  return `
    <div class="alloc-row">
      <span class="nm">${escapeHtml(channelLabel(placement.channel))}</span>
      <span class="track"><span class="fill" style="width:100%"></span></span>
      <span class="pct">${formatYen(placement.budget_jpy)}</span>
    </div>
  `;
}

function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    search: "検索広告",
    social: "SNS広告",
    display: "バナー広告",
  };
  return labels[channel] ?? channel;
}

function renderTasks(): void {
  const campaign = activeOrLatest();
  const content = el("tasks-content");
  if (campaign == null) {
    content.innerHTML = emptyState("確認待ちはありません", "出す前の確認を通った広告だけが、ここに表示されます。");
    return;
  }
  const pending = pendingPublishAction(campaign);
  if (pending == null) {
    content.innerHTML = emptyState("確認待ちはありません", "数字と表現の確認を通すと、広告を出す前の最終確認がここに入ります。");
    return;
  }
  const approveBusy = isLoading("approveAction", pending.id);
  const actionDisabled = getState().loading != null || getState().devTokenAvailable !== true;
  content.innerHTML = `
    ${generationStepper(campaign)}
    <div class="approval-list">
      <article class="approval-item">
        <div>
          <span class="data-label pending">確認待ち</span>
          <h3>${escapeHtml(campaign.brief.name)} を広告に出す</h3>
          <p>数字と表現の確認は完了済み。広告を出す最終確認ができるのは承認者または管理者のみです。</p>
        </div>
        <button class="btn primary" type="button" data-approve-action="${safeAttr(pending.id)}" ${actionDisabled ? "disabled" : ""}>
          ${approveBusy ? `${spinner()} 処理中...` : "広告を出すことを承認"}
        </button>
      </article>
      ${approveBusy ? loadingPanel("承認を送信中...") : ""}
    </div>
  `;
}

function renderDashboard(): void {
  const campaign = activeOrLatest();
  const content = el("dashboard-content");
  if (campaign == null) {
    content.innerHTML = emptyState("成果はまだありません", "広告案を作成すると、予測や実データの数字をここで確認できます。");
    destroyChart();
    return;
  }
  const metric = latestMetric(campaign);
  const forecastCpa = formatEstimate(
    campaign.media_plan.estimated_cpa_jpy,
    campaign.media_plan.estimated_cpa_jpy_range,
    "yen",
  );
  const metricCpa = metric?.cpa_jpy_range
    ? formatEstimate(metric.cpa_jpy, metric.cpa_jpy_range, "yen")
    : null;
  const metricConversions = metric?.conversions_range
    ? formatEstimate(metric.conversions, metric.conversions_range, "count")
    : null;
  content.innerHTML = `
    <div class="dash-head">
      <div>
        <span class="data-label ${metric ? "forecast" : "pending"}">${metric ? dataLabel(metric.data_kind) : "計測待ち"}</span>
        <h3>${escapeHtml(campaign.brief.name)}</h3>
        <p>${campaign.publish_result == null ? "広告を出す前の確認中" : "広告を出した状態 / テスト用の結果"}</p>
      </div>
    </div>
    <div class="dash-top">
      ${metricCell("費用対効果", metric ? `${metric.roas.toFixed(2)}倍` : "計測待ち", metric ? `確かさ ${pct(metric.confidence)}` : "確認待ち")}
      ${metricCell("1件あたりの費用", metric ? (metricCpa?.value ?? formatYen(metric.cpa_jpy)) : forecastCpa.value, metric ? (metricCpa?.sub ?? dataLabel(metric.data_kind)) : forecastCpa.sub)}
      ${metricCell("成果数", metric ? (metricConversions?.value ?? String(metric.conversions)) : "計測待ち", metric ? (metricConversions?.sub ?? dataLabel(metric.labels.conversions)) : "確認待ち")}
      ${metricCell("使った広告費", metric ? formatYen(metric.ad_spend_jpy) : "計測待ち", metric ? dataLabel(metric.labels.ad_spend_jpy) : "確認待ち")}
    </div>
    <div class="card pad chart-card">
      <div class="sec-title">現在の成果<span class="hint live">${metric ? `${dataLabel(metric.data_kind)} / 履歴グラフは未接続` : "計測待ち"}</span></div>
      ${
        metric
          ? `<canvas id="performance-chart" height="180" aria-label="現在のコンバージョン"></canvas>`
          : `<div class="chart-empty">数字の確認後に、現在の成果だけを表示します。</div>`
      }
    </div>
    <div class="guardrail">
      <span class="gi">!</span>
      <div class="gt"><b>緊急停止:</b> テスト用の媒体では「止める想定」の確認だけです。実際の広告停止ではありません。</div>
    </div>
  `;
  renderChart(metric);
}

function renderChart(metric: MetricSnapshot | null): void {
  const canvas = document.getElementById("performance-chart") as HTMLCanvasElement | null;
  if (canvas == null || metric == null) {
    destroyChart();
    return;
  }
  const nextSignature = JSON.stringify({
    id: metric.id,
    data_kind: metric.data_kind,
    conversions: metric.conversions,
  });
  if (chart != null && chart.canvas === canvas && chartSignature === nextSignature) return;
  destroyChart();
  chart = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["現在値"],
      datasets: [
        {
          label: dataLabel(metric.data_kind),
          data: [metric.conversions],
          borderColor: "#5a5ff0",
          backgroundColor: "rgba(90,95,240,.14)",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });
  chartSignature = nextSignature;
}

function destroyChart(): void {
  chart?.destroy();
  chart = null;
  chartSignature = null;
}

function renderAudit(): void {
  const campaign = activeOrLatest();
  const state = getState();
  const content = el("audit-content");
  if (campaign == null) {
    content.innerHTML = emptyState("操作記録はまだありません", "広告案を作成すると、誰が何をしたかの記録を表示します。");
    return;
  }
  const verify = renderAuditVerification();
  content.innerHTML = `
    <div class="audit-card">
      <div class="hash-chain"><span></span><span></span><span></span></div>
      <div>
        <h3>変更できない操作記録</h3>
        <p>${escapeHtml(campaign.brief.name)} の操作を保存しています。</p>
        ${verify}
      </div>
    </div>
    <div class="approval-list">
      ${state.auditEntries.map(auditRow).join("") || emptyState("操作記録を読み込み中", "保存された記録を取得しています。")}
    </div>
  `;
}

function renderAuditVerification(): string {
  const state = getState();
  if (isLoading("verifyAudit")) {
    return `<div class="status-pill neutral">${spinner()} 検証中...</div>`;
  }
  const verification = state.auditVerification;
  if (verification == null) {
    return `<div class="status-pill neutral">検証は管理者のみ</div>`;
  }
  if (verification.valid) {
    return `<div class="status-pill neutral">記録のつながりは正常・${escapeHtml(String(verification.entries_checked))}件</div>`;
  }
  const brokenId = verification.broken_entry_id ?? "不明";
  const reason = verification.reason ?? "記録のつながりが一致しません";
  return `<div class="status-pill amber">破損: ${escapeHtml(brokenId)} / ${escapeHtml(reason)}</div>`;
}

function auditRow(entry: { event_type: string; summary: string; hash: string; created_at: string }): string {
  return `
    <article class="approval-item">
      <div>
        <span class="data-label forecast">${escapeHtml(auditEventLabel(entry.event_type))}</span>
        <h3>${escapeHtml(auditSummary(entry))}</h3>
        <p>${escapeHtml(new Date(entry.created_at).toLocaleString("ja-JP"))}</p>
      </div>
      <span class="status-pill neutral">保存済み</span>
    </article>
  `;
}

function auditEventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    "campaign.proposal.created": "広告案を作成",
    "campaign.measurement.refreshed": "数字を確認",
    "campaign.legal_check.completed": "表現を確認",
    "campaign.publish.requested": "最終確認へ登録",
    "campaign.publish.approved": "広告を出す承認",
    "campaign.publish.rejected": "広告を出す確認を差し戻し",
    "campaign.kill_switch.evaluated": "緊急停止を判定",
    "campaign.audit.verified": "記録を検証",
  };
  return labels[eventType] ?? "操作記録";
}

function auditSummary(entry: { event_type: string; summary: string }): string {
  const summaries: Record<string, string> = {
    "campaign.proposal.created": "広告案を作成しました。広告文と配信先の案はサーバー側で作成されています。",
    "campaign.measurement.refreshed": "広告を出す前に売上・アクセスの数字を確認しました。",
    "campaign.legal_check.completed": "広告文の表現を確認しました。",
    "campaign.publish.requested": "広告を出す前の最終確認に登録しました。まだ実際の広告操作は行っていません。",
    "campaign.publish.approved": "確認待ちだった広告開始を承認し、テスト用の媒体へ送信しました。",
    "campaign.publish.rejected": "確認待ちだった広告開始を差し戻しました。実際の広告操作は行っていません。",
    "campaign.kill_switch.evaluated": "緊急停止の判定を実行しました。",
  };
  return summaries[entry.event_type] ?? entry.summary;
}

function renderSettings(): void {
  const state = getState();
  const canManageIntegrations = state.devTokenAvailable === true && state.role === "admin";
  el("settings-content").innerHTML = `
    <div class="settings-grid">
      <article class="setting-card settings-wide">
        <div class="setting-head">
          <div>
            <h3>データ連携</h3>
            <p>実データにつなぐ準備画面です。今はテスト用の数字として表示します。</p>
          </div>
          <span class="badge amber">APIキー入力なし</span>
        </div>
        <div class="integration-list">
          ${dataIntegrationRows(canManageIntegrations)}
        </div>
        <p class="setting-note">接続はサーバー側のOAuthで行います。APIキーや秘密情報はこの画面で入力・保存・表示しません。</p>
      </article>
      <article class="setting-card">
        <h3>権限</h3>
        <p>担当者、承認者、管理者でできる操作を分けています。広告を出す前は承認者以上が確認します。</p>
        <span class="badge">担当者 / 承認者 / 管理者</span>
      </article>
      <article class="setting-card">
        <h3>売上・アクセス連携</h3>
        <p>今はテスト用の数字で確認中です。実データ連携までは、画面上もテスト用と表示します。</p>
        <span class="badge amber">テスト用</span>
      </article>
      <article class="setting-card">
        <h3>緊急停止</h3>
        <p>テスト用の媒体では実際の広告停止ではなく、止める判断の確認として扱います。</p>
        <span class="badge red">実停止なし</span>
      </article>
    </div>
  `;
}

function dataIntegrationRows(canManageIntegrations: boolean): string {
  return dataIntegrations
    .map((integration) => {
      const disabled = canManageIntegrations ? "" : " disabled";
      const title = canManageIntegrations
        ? "接続手順を確認"
        : "管理者だけが接続できます";
      return `
        <div class="integration-row">
          <div class="integration-meta">
            <strong>${escapeHtml(integration.name)}</strong>
            <span>${escapeHtml(integration.purpose)}</span>
          </div>
          <span class="badge ${integrationBadgeClass(integration.status)}" data-integration-status="${safeAttr(integration.status)}">${escapeHtml(integrationStatusLabel(integration.status))}</span>
          <button class="btn ghost integration-action" type="button" data-integration-connect="${safeAttr(integration.key)}" aria-label="${safeAttr(`${integration.name}を${integrationActionLabel(integration.status)}`)}" title="${safeAttr(title)}"${disabled}>${escapeHtml(integrationActionLabel(integration.status))}</button>
        </div>
      `;
    })
    .join("");
}

function integrationStatusLabel(status: DataIntegrationStatus): string {
  const labels: Record<DataIntegrationStatus, string> = {
    unconnected: "未接続",
    connected: "接続済み",
    test: "テスト用",
    error: "エラー",
  };
  return labels[status];
}

function integrationBadgeClass(status: DataIntegrationStatus): string {
  if (status === "test") return "amber";
  if (status === "error") return "red";
  return "";
}

function integrationActionLabel(status: DataIntegrationStatus): string {
  return status === "connected" || status === "error" ? "再接続" : "接続する";
}

async function bootstrap(): Promise<void> {
  renderNav();
  bindEvents();
  subscribe(render);
  await switchRole("operator");
  render();
}

function bindEvents(): void {
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const routeButton = target.closest<HTMLButtonElement>("[data-route]");
    if (routeButton?.dataset.route != null) setRoute(routeButton.dataset.route as RouteName);

    const roleButton = target.closest<HTMLButtonElement>("[data-role]");
    if (roleButton?.dataset.role != null) void switchRole(roleButton.dataset.role as Role);

    const chip = target.closest<HTMLButtonElement>(".chip");
    if (chip?.dataset.product != null) {
      selectWithin(chip, ".chip");
      (el<HTMLInputElement>("product-input")).value = chip.dataset.product;
    }

    const goal = target.closest<HTMLButtonElement>(".goal-pill");
    if (goal != null) selectWithin(goal, ".goal-pill");

    const autonomy = target.closest<HTMLButtonElement>(".choice-card");
    if (autonomy != null) selectWithin(autonomy, ".choice-card");

    const integrationConnect = target.closest<HTMLButtonElement>("[data-integration-connect]");
    if (integrationConnect?.dataset.integrationConnect != null) {
      showIntegrationNotice(integrationConnect.dataset.integrationConnect);
    }

    const selectCampaign = target.closest<HTMLButtonElement>("[data-select-campaign]");
    if (selectCampaign?.dataset.selectCampaign != null) {
      setState({ activeCampaignId: selectCampaign.dataset.selectCampaign });
      setRoute("dashboard");
    }

    const retry = target.closest<HTMLButtonElement>("[data-retry-campaign]");
    if (retry?.dataset.retryCampaign != null) retryCampaignBrief(retry.dataset.retryCampaign);

    const gate = target.closest<HTMLButtonElement>("[data-start-gate]");
    if (gate?.dataset.startGate != null) void runPublishGate(gate.dataset.startGate);

    const approve = target.closest<HTMLButtonElement>("[data-approve-action]");
    if (approve?.dataset.approveAction != null) void approvePendingAction(approve.dataset.approveAction);

    const modal = target.closest<HTMLButtonElement>("[data-open-modal]");
    if (modal?.dataset.openModal != null) openModal(modal.dataset.openModal);

    if (target.closest("[data-close-modal]") != null) closeModal();
  });

  el<HTMLFormElement>("campaign-form").addEventListener("submit", (event) => {
    event.preventDefault();
    void createCampaign();
  });
  el<HTMLInputElement>("budget-range").addEventListener("input", (event) => {
    const value = Number((event.target as HTMLInputElement).value) * 10000;
    el("budget-value").textContent = formatYen(value);
  });
  el("verify-audit-button").addEventListener("click", () => void verifyAudit());
  el<HTMLDialogElement>("evidence-modal").addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeModal();
  });
  el<HTMLDialogElement>("evidence-modal").addEventListener("close", restoreModalFocus);
}

function selectWithin(button: HTMLButtonElement, selector: string): void {
  const group = button.closest(".chips, .goal-pills, .choice-cards");
  group?.querySelectorAll(selector).forEach((item) => item.classList.remove("selected"));
  button.classList.add("selected");
}

function retryCampaignBrief(campaignId: string): void {
  const campaign = getState().campaigns.find((item) => item.id === campaignId);
  if (campaign == null) return;
  el<HTMLInputElement>("product-input").value = campaign.brief.name;
  const budgetUnits = Math.max(10, Math.min(500, Math.round(campaign.brief.total_budget_jpy / 10000)));
  el<HTMLInputElement>("budget-range").value = String(budgetUnits);
  el("budget-value").textContent = formatYen(budgetUnits * 10000);
  selectByDataset(".goal-pill", "objective", campaign.brief.objective);
  selectByDataset(".choice-card", "autonomy", campaign.brief.autonomy_level, "approval_only");
  setRoute("home");
  el<HTMLInputElement>("product-input").focus();
}

function selectByDataset(selector: string, key: string, value: string, fallbackValue?: string): void {
  const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>(selector));
  const targetValue = selector === ".choice-card" && value === "full_auto" ? "approval_only" : value;
  let matched = false;
  candidates.forEach((button) => {
    const selected = button.dataset[key] === targetValue;
    if (selected) matched = true;
    button.classList.toggle("selected", selected);
  });
  if (matched || fallbackValue == null) return;
  candidates.forEach((button) => {
    button.classList.toggle("selected", button.dataset[key] === fallbackValue);
  });
}

function showIntegrationNotice(integrationKey: string): void {
  const integration = dataIntegrations.find((item) => item.key === integrationKey);
  if (integration == null) return;
  setState({
    error: {
      status: 0,
      message: `${integration.name}は今はテスト用です。実接続はサーバー側OAuthで追加します。APIキーはこの画面では扱いません。`,
      detail: integration.key,
    },
  });
}

async function switchRole(role: Role): Promise<void> {
  if (!beginOperation({ operation: "switchRole", role })) return;
  try {
    const auth = await api.devToken(role);
    setBearerToken(auth.token);
    const campaigns = await api.listCampaigns();
    setState({
      role,
      auth,
      devTokenAvailable: true,
      campaigns,
      activeCampaignId: nextActiveCampaignId(campaigns),
      loading: null,
      error: null,
    });
    if (getState().route === "audit") void loadAudit();
  } catch (error) {
    const uiError = error as UiError;
    if (
      uiError.status === 403 &&
      uiError.detail.includes("Development token minting is disabled")
    ) {
      setBearerToken(null);
      setState({
        auth: null,
        devTokenAvailable: false,
        loading: null,
        error: null,
      });
      return;
    }
    setState({ error: uiError, failedOperation: getState().loading, loading: null });
  }
}

async function createCampaign(): Promise<void> {
  if (!beginOperation({ operation: "createCampaign" })) return;
  try {
    const campaign = await api.createProposal(formToBrief());
    upsertCampaign(campaign);
    setRoute("creative");
    setState({ loading: null });
  } catch (error) {
    setState({ error: error as UiError, failedOperation: getState().loading, loading: null });
  }
}

async function runPublishGate(campaignId: string): Promise<void> {
  if (!beginOperation({ operation: "runPublishGate", targetId: campaignId, phase: "measurement" })) return;
  try {
    await api.refreshMeasurements(campaignId);
    setState({ loading: { operation: "runPublishGate", targetId: campaignId, phase: "legal" } });
    await api.runLegalCheck(campaignId);
    setState({
      loading: { operation: "runPublishGate", targetId: campaignId, phase: "publish_request" },
    });
    const campaign = await api.requestPublish(campaignId);
    upsertCampaign(campaign);
    setRoute("tasks");
    setState({ loading: null });
  } catch (error) {
    setState({ error: error as UiError, failedOperation: getState().loading, loading: null });
  }
}

async function approvePendingAction(actionId: string): Promise<void> {
  const campaign = activeOrLatest();
  if (campaign == null) return;
  if (!beginOperation({ operation: "approveAction", targetId: actionId })) return;
  try {
    const approved = await api.approveAction(campaign.id, actionId);
    upsertCampaign(approved);
    setRoute("dashboard");
    setState({ loading: null });
  } catch (error) {
    setState({ error: error as UiError, failedOperation: getState().loading, loading: null });
  }
}

async function loadAudit(): Promise<void> {
  const campaign = activeOrLatest();
  if (campaign == null) return;
  if (!beginOperation({ operation: "loadAudit", targetId: campaign.id })) return;
  try {
    const auditEntries = await api.listAudit(campaign.id);
    setState({ auditEntries, error: null, loading: null });
  } catch (error) {
    setState({ error: error as UiError, failedOperation: getState().loading, loading: null });
  }
}

async function verifyAudit(): Promise<void> {
  if (!beginOperation({ operation: "verifyAudit" })) return;
  try {
    const auditVerification = await api.verifyAudit();
    setState({ auditVerification, error: null, loading: null });
  } catch (error) {
    setState({ error: error as UiError, failedOperation: getState().loading, loading: null });
  }
}

function beginOperation(loading: LoadingState): boolean {
  if (getState().loading != null) return false;
  setState({ loading, failedOperation: null, error: null });
  return true;
}

function nextActiveCampaignId(campaigns: CampaignProposal[]): string | null {
  const current = getState().activeCampaignId;
  if (current != null && campaigns.some((campaign) => campaign.id === current)) {
    return current;
  }
  return campaigns[0]?.id ?? null;
}

function formToBrief(): CampaignBrief {
  const product = el<HTMLInputElement>("product-input").value.trim();
  const budget = Number(el<HTMLInputElement>("budget-range").value) * 10000;
  const objective =
    document.querySelector<HTMLButtonElement>(".goal-pill.selected")?.dataset.objective ??
    "conversion";
  const autonomy =
    (document.querySelector<HTMLButtonElement>(".choice-card.selected")?.dataset
      .autonomy as AutonomyLevel | undefined) ?? "approval_only";
  return {
    name: product,
    objective,
    target_audience: "Tact UI generated audience",
    total_budget_jpy: budget,
    channels: ["search", "social", "display"],
    kpis: objective === "efficiency" ? ["cpa_jpy"] : ["roas", "conversions"],
    tone: "clear and practical",
    autonomy_level: autonomy,
  };
}

function openModal(key: string): void {
  const campaign = activeOrLatest();
  const title = el("modal-title");
  const body = el("modal-body");
  lastFocusedBeforeModal =
    document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (key === "creative" && campaign != null) {
    title.textContent = "作成の根拠";
    body.innerHTML = `
      <p>入力された商材・予算・配信先をもとに、テスト用の作成方法で広告案を表示しています。</p>
      <div class="reason-box"><strong>商材</strong><p>${escapeHtml(campaign.brief.name)}</p></div>
      <div class="reason-box"><strong>予算</strong><p>${escapeHtml(formatYen(campaign.brief.total_budget_jpy))}</p></div>
      <div class="reason-box"><strong>配信先の数</strong><p>${escapeHtml(campaign.media_plan.placements.length)}件</p></div>
    `;
  } else {
    title.textContent = "根拠を見る";
    body.innerHTML = `<p>広告案を作成すると、広告文・配信先・操作記録にもとづく根拠を表示します。</p>`;
  }
  el<HTMLDialogElement>("evidence-modal").showModal();
}

function closeModal(): void {
  el<HTMLDialogElement>("evidence-modal").close();
}

function restoreModalFocus(): void {
  lastFocusedBeforeModal?.focus();
  lastFocusedBeforeModal = null;
}

function latestMetric(campaign: CampaignProposal): MetricSnapshot | null {
  return campaign.metric_snapshots[campaign.metric_snapshots.length - 1] ?? null;
}

function latestLegalCheck(campaign: CampaignProposal): LegalCheckResult | null {
  return campaign.legal_checks[campaign.legal_checks.length - 1] ?? null;
}

function pendingPublishAction(campaign: CampaignProposal): AgentAction | null {
  return (
    campaign.actions.find(
      (action) => action.kind === "publish_campaign" && action.approval_status === "pending_approval",
    ) ?? null
  );
}

function emptyState(title: string, body: string): string {
  return `<article class="empty-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></article>`;
}

function metricCell(label: string, value: string, sub: string): string {
  return `<span><b>${escapeHtml(value)}</b><small>${escapeHtml(label)} / ${escapeHtml(sub)}</small></span>`;
}

function formatEstimate(
  value: number,
  range: EstimateRange | null | undefined,
  kind: "yen" | "count",
): { value: string; sub: string } {
  if (range == null) {
    return {
      value: formatByKind(value, kind),
      sub: "目安 / 幅なし",
    };
  }
  return {
    value: `${formatByKind(range.low, kind)}〜${formatByKind(range.high, kind)}`,
    sub:
      range.confidence == null
        ? sourceLabel(range.source)
        : `${sourceLabel(range.source)} / 確かさ ${pct(range.confidence)}`,
  };
}

function sourceLabel(source: EstimateRange["source"]): string {
  if (source === "measured") return "実データ";
  if (source === "model") return "自動推定";
  return "テスト用の数字";
}

function outputSourceLabel(source: "mock" | "model"): string {
  return source === "model" ? "自動作成" : "テスト用の案";
}

function formatByKind(value: number, kind: "yen" | "count"): string {
  return kind === "yen" ? formatYen(value) : Math.round(value).toLocaleString("ja-JP");
}

function formatYen(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function dataLabel(kind: string): string {
  return kind === "measured" ? "実データ" : "テスト用";
}

function spinner(): string {
  return `<span class="spinner" aria-hidden="true"></span>`;
}

function arrowIcon(): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>`;
}

function loadingPanel(message: string): string {
  return `
    <div class="loading-panel" aria-live="polite">
      <span class="skeleton-block"></span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

void bootstrap();
