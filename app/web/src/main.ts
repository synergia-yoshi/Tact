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
  MetricSnapshot,
  Role,
  RouteName,
  UiError,
} from "./types";

const routes: Array<{ id: RouteName; label: string; icon: string }> = [
  { id: "home", label: "ホーム", icon: '<path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />' },
  { id: "campaigns", label: "キャンペーン", icon: '<rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" />' },
  { id: "dashboard", label: "ダッシュボード", icon: '<path d="M4 19V5" /><path d="M4 19h16" /><path d="m8 15 3-4 3 2 4-7" />' },
  { id: "tasks", label: "タスク", icon: '<path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />' },
  { id: "creative", label: "クリエイティブ", icon: '<rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="m21 15-5-5L5 21" />' },
  { id: "audit", label: "監査", icon: '<path d="M12 3 4 7v6c0 5 8 8 8 8s8-3 8-8V7l-8-4Z" /><path d="m9 12 2 2 4-4" />' },
  { id: "settings", label: "設定", icon: '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 1.6V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />' },
];

let chart: Chart | null = null;

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
  el("role-label").textContent = state.role;
  el("role-avatar").textContent = state.role[0]?.toUpperCase() ?? "O";
  el("auth-mode-label").textContent = state.auth?.auth_mode ?? "auth pending";
  el("server-label").textContent = state.auth?.auth_mode === "signed_bearer" ? "signed_bearer 接続" : "local dev";
  document.querySelectorAll<HTMLButtonElement>(".role-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.role === state.role);
  });
  renderToast(state.error);
  renderCampaigns();
  renderCreative();
  renderTasks();
  renderDashboard();
  renderAudit();
  renderSettings();
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
    content.innerHTML = emptyState("まだキャンペーンがありません", "ホームから3問に答えると、サーバー生成の提案だけがここに表示されます。");
    return;
  }
  content.innerHTML = `<div class="card-grid">${campaigns.map(campaignCard).join("")}</div>`;
}

function campaignCard(campaign: CampaignProposal): string {
  const latest = latestMetric(campaign);
  const status = campaign.publish_result == null ? "承認前" : "配信済み";
  const statusClass = campaign.publish_result == null ? "pending" : "forecast";
  return `
    <article class="campaign-card">
      <span class="data-label ${statusClass}">${escapeHtml(status)}</span>
      <h3>${escapeHtml(campaign.brief.name)}</h3>
      <p>${escapeHtml(campaign.creative.headline)}</p>
      <div class="kpi-row">
        ${metricCell("予測CPA", forecastRange(campaign.media_plan.estimated_cpa_jpy, "yen"), "予測 / シミュレーション")}
        ${metricCell("ROAS", latest ? `${latest.roas.toFixed(2)}x` : "計測待ち", latest ? dataLabel(latest.data_kind) : "未計測")}
      </div>
      <button class="btn ghost card-action" type="button" data-select-campaign="${safeAttr(campaign.id)}">開く</button>
    </article>
  `;
}

function renderCreative(): void {
  const campaign = activeOrLatest();
  const content = el("creative-content");
  if (campaign == null) {
    content.innerHTML = emptyState("生成結果はまだありません", "ホームから提案を作成すると、creative と media_plan をサーバーから描画します。");
    return;
  }
  content.innerHTML = `
    <div class="creative-grid">
      <article class="copy-card">
        <span class="segment">サーバー生成コピー</span>
        <strong>${escapeHtml(campaign.creative.headline)}</strong>
        <p>${escapeHtml(campaign.creative.body)}</p>
        <div class="copy-cta">${escapeHtml(campaign.creative.call_to_action)}</div>
      </article>
      <article class="mock-banner">
        <span>Feed</span>
        <strong>${escapeHtml(campaign.creative.headline)}</strong>
        <small>生成済み / 配信前レビュー</small>
      </article>
    </div>
    <div class="out in">
      <h3>媒体配分 <span class="data-label forecast">サーバー生成</span></h3>
      ${campaign.media_plan.placements.map(placementRow).join("")}
    </div>
    <div class="out in">
      <h3>KPI 予測 <span class="data-label forecast">予測 / シミュレーション</span></h3>
      <div class="kpi-row">
        ${metricCell("推定リーチ", forecastRange(campaign.media_plan.estimated_reach, "count"), "信頼度 62%")}
        ${metricCell("推定CPA", forecastRange(campaign.media_plan.estimated_cpa_jpy, "yen"), "配信前シミュレーション")}
      </div>
    </div>
    <div class="action-row">
      <p>配信開始は計測・法務チェックを通したあと、承認キューへ入ります。</p>
      <button class="btn primary" type="button" data-start-gate="${safeAttr(campaign.id)}">配信ゲートを実行</button>
    </div>
  `;
}

function placementRow(placement: { channel: string; budget_jpy: number }): string {
  return `
    <div class="alloc-row">
      <span class="nm">${escapeHtml(placement.channel)}</span>
      <span class="track"><span class="fill" style="width:100%"></span></span>
      <span class="pct">${formatYen(placement.budget_jpy)}</span>
    </div>
  `;
}

function renderTasks(): void {
  const campaign = activeOrLatest();
  const content = el("tasks-content");
  if (campaign == null) {
    content.innerHTML = emptyState("承認待ちはありません", "pending_approval の publish action だけがここに表示されます。");
    return;
  }
  const pending = pendingPublishAction(campaign);
  if (pending == null) {
    content.innerHTML = emptyState("承認待ちはありません", "計測・法務ゲートを通すと、publish action がここに入ります。");
    return;
  }
  content.innerHTML = `
    <div class="approval-list">
      <article class="approval-item">
        <div>
          <span class="data-label pending">pending_approval</span>
          <h3>${escapeHtml(campaign.brief.name)} の配信開始</h3>
          <p>計測と法務チェックを通過済み。承認できるのは approver / admin のみです。</p>
        </div>
        <button class="btn primary" type="button" data-approve-action="${safeAttr(pending.id)}">承認する</button>
      </article>
    </div>
  `;
}

function renderDashboard(): void {
  const campaign = activeOrLatest();
  const content = el("dashboard-content");
  if (campaign == null) {
    content.innerHTML = emptyState("ダッシュボードはまだありません", "キャンペーン作成後に、予測と実測/シミュレーションのラベル付きKPIを表示します。");
    destroyChart();
    return;
  }
  const metric = latestMetric(campaign);
  content.innerHTML = `
    <div class="dash-head">
      <div>
        <span class="data-label ${metric ? "forecast" : "pending"}">${metric ? dataLabel(metric.data_kind) : "計測待ち"}</span>
        <h3>${escapeHtml(campaign.brief.name)}</h3>
        <p>${campaign.publish_result == null ? "配信承認前" : "配信済み / mock媒体はシミュレーション"}</p>
      </div>
    </div>
    <div class="dash-top">
      ${metricCell("ROAS", metric ? `${metric.roas.toFixed(2)}x` : "計測待ち", metric ? `信頼度 ${pct(metric.confidence)}` : "pending")}
      ${metricCell("CPA", metric ? formatYen(metric.cpa_jpy) : forecastRange(campaign.media_plan.estimated_cpa_jpy, "yen"), metric ? dataLabel(metric.data_kind) : "予測 / シミュレーション")}
      ${metricCell("CV", metric ? String(metric.conversions) : "計測待ち", metric ? dataLabel(metric.labels.conversions) : "pending")}
      ${metricCell("消化", metric ? formatYen(metric.ad_spend_jpy) : "計測待ち", metric ? dataLabel(metric.labels.ad_spend_jpy) : "pending")}
    </div>
    <div class="card pad chart-card">
      <div class="sec-title">パフォーマンス推移<span class="hint live">${metric ? dataLabel(metric.data_kind) : "計測待ち"}</span></div>
      <canvas id="performance-chart" height="180" aria-label="パフォーマンス推移"></canvas>
    </div>
    <div class="guardrail">
      <span class="gi">!</span>
      <div class="gt"><b>Kill Switch:</b> mock媒体では「シミュレーション」です。実停止ではありません。</div>
    </div>
  `;
  renderChart(metric);
}

function renderChart(metric: MetricSnapshot | null): void {
  const canvas = document.getElementById("performance-chart") as HTMLCanvasElement | null;
  if (canvas == null) return;
  destroyChart();
  const base = metric?.conversions ?? 0;
  chart = new Chart(canvas, {
    type: "line",
    data: {
      labels: ["生成", "計測", "承認", "配信", "改善"],
      datasets: [
        {
          label: metric == null ? "計測待ち" : dataLabel(metric.data_kind),
          data: [0, base * 0.3, base * 0.55, base * 0.8, base],
          borderColor: "#5a5ff0",
          backgroundColor: "rgba(90,95,240,.14)",
          fill: true,
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function destroyChart(): void {
  chart?.destroy();
  chart = null;
}

function renderAudit(): void {
  const campaign = activeOrLatest();
  const state = getState();
  const content = el("audit-content");
  if (campaign == null) {
    content.innerHTML = emptyState("監査ログはまだありません", "キャンペーン作成後に、サーバー生成の監査ログを表示します。");
    return;
  }
  const verify = state.auditVerification
    ? `<div class="status-pill neutral">verify: ${escapeHtml(JSON.stringify(state.auditVerification))}</div>`
    : `<div class="status-pill neutral">verify は admin のみ</div>`;
  content.innerHTML = `
    <div class="audit-card">
      <div class="hash-chain"><span></span><span></span><span></span></div>
      <div>
        <h3>append-only hash chain</h3>
        <p>${escapeHtml(campaign.id)} / ${escapeHtml(campaign.org_id)}</p>
        ${verify}
      </div>
    </div>
    <div class="approval-list">
      ${state.auditEntries.map(auditRow).join("") || emptyState("監査ログを読み込み中", "サーバーから取得します。")}
    </div>
  `;
}

function auditRow(entry: { event_type: string; summary: string; hash: string; created_at: string }): string {
  return `
    <article class="approval-item">
      <div>
        <span class="data-label forecast">${escapeHtml(entry.event_type)}</span>
        <h3>${escapeHtml(entry.summary)}</h3>
        <p>${escapeHtml(new Date(entry.created_at).toLocaleString("ja-JP"))}</p>
      </div>
      <code>${escapeHtml(entry.hash.slice(0, 12))}</code>
    </article>
  `;
}

function renderSettings(): void {
  el("settings-content").innerHTML = `
    <div class="settings-grid">
      <article class="setting-card">
        <h3>認証</h3>
        <p>UIは signed_bearer + exp + roles でAPIを呼びます。ロール切替はlocal-only dev tokenです。</p>
        <span class="badge">operator / approver / admin</span>
      </article>
      <article class="setting-card">
        <h3>GA4 / Shopify</h3>
        <p>現状は mock read model。実測接続まではシミュレーションと表示します。</p>
        <span class="badge amber">mock</span>
      </article>
      <article class="setting-card">
        <h3>Kill Switch</h3>
        <p>mock媒体では実停止ではなくシミュレーションとして扱います。</p>
        <span class="badge red">実停止なし</span>
      </article>
    </div>
  `;
}

async function bootstrap(): Promise<void> {
  renderNav();
  bindEvents();
  subscribe(render);
  await switchRole("operator");
  await refreshCampaigns();
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

    const selectCampaign = target.closest<HTMLButtonElement>("[data-select-campaign]");
    if (selectCampaign?.dataset.selectCampaign != null) {
      setState({ activeCampaignId: selectCampaign.dataset.selectCampaign });
      setRoute("dashboard");
    }

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
}

function selectWithin(button: HTMLButtonElement, selector: string): void {
  const group = button.closest(".chips, .goal-pills, .choice-cards");
  group?.querySelectorAll(selector).forEach((item) => item.classList.remove("selected"));
  button.classList.add("selected");
}

async function switchRole(role: Role): Promise<void> {
  try {
    setState({ loading: true, error: null });
    const auth = await api.devToken(role);
    setBearerToken(auth.token);
    setState({ role, auth, loading: false });
    await refreshCampaigns();
  } catch (error) {
    setState({ error: error as UiError, loading: false });
  }
}

async function refreshCampaigns(): Promise<void> {
  try {
    const campaigns = await api.listCampaigns();
    setState({
      campaigns,
      activeCampaignId: getState().activeCampaignId ?? campaigns[0]?.id ?? null,
      error: null,
    });
  } catch (error) {
    setState({ error: error as UiError });
  }
}

async function createCampaign(): Promise<void> {
  try {
    setState({ loading: true, error: null });
    const campaign = await api.createProposal(formToBrief());
    upsertCampaign(campaign);
    setRoute("creative");
    setState({ loading: false });
  } catch (error) {
    setState({ error: error as UiError, loading: false });
  }
}

async function runPublishGate(campaignId: string): Promise<void> {
  try {
    setState({ loading: true, error: null });
    await api.refreshMeasurements(campaignId);
    await api.runLegalCheck(campaignId);
    const campaign = await api.requestPublish(campaignId);
    upsertCampaign(campaign);
    setRoute("tasks");
    setState({ loading: false });
  } catch (error) {
    setState({ error: error as UiError, loading: false });
  }
}

async function approvePendingAction(actionId: string): Promise<void> {
  const campaign = activeOrLatest();
  if (campaign == null) return;
  try {
    setState({ loading: true, error: null });
    const approved = await api.approveAction(campaign.id, actionId);
    upsertCampaign(approved);
    setRoute("dashboard");
    setState({ loading: false });
  } catch (error) {
    setState({ error: error as UiError, loading: false });
  }
}

async function loadAudit(): Promise<void> {
  const campaign = activeOrLatest();
  if (campaign == null) return;
  try {
    const auditEntries = await api.listAudit(campaign.id);
    setState({ auditEntries, error: null });
  } catch (error) {
    setState({ error: error as UiError });
  }
}

async function verifyAudit(): Promise<void> {
  try {
    const auditVerification = await api.verifyAudit();
    setState({ auditVerification, error: null });
  } catch (error) {
    setState({ error: error as UiError });
  }
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
  if (key === "creative" && campaign != null) {
    title.textContent = "生成の根拠";
    body.innerHTML = `
      <p>サーバーが受け取った CampaignBrief と mock adapter の出力をもとに表示しています。</p>
      <div class="reason-box"><strong>商材</strong><p>${escapeHtml(campaign.brief.name)}</p></div>
      <div class="reason-box"><strong>予算</strong><p>${escapeHtml(formatYen(campaign.brief.total_budget_jpy))}</p></div>
      <div class="reason-box"><strong>媒体数</strong><p>${escapeHtml(campaign.media_plan.placements.length)} placements</p></div>
    `;
  } else {
    title.textContent = "根拠を見る";
    body.innerHTML = `<p>提案作成後に、サーバー生成の creative / media_plan と監査ログに基づく根拠を表示します。</p>`;
  }
  el<HTMLDialogElement>("evidence-modal").showModal();
}

function closeModal(): void {
  el<HTMLDialogElement>("evidence-modal").close();
}

function latestMetric(campaign: CampaignProposal): MetricSnapshot | null {
  return campaign.metric_snapshots[campaign.metric_snapshots.length - 1] ?? null;
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

function forecastRange(value: number, kind: "yen" | "count"): string {
  const low = Math.round(value * 0.86);
  const high = Math.round(value * 1.14);
  return kind === "yen" ? `${formatYen(low)}-${formatYen(high)}` : `${low.toLocaleString("ja-JP")}-${high.toLocaleString("ja-JP")}`;
}

function formatYen(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function dataLabel(kind: string): string {
  return kind === "measured" ? "実測" : "シミュレーション";
}

void bootstrap();
