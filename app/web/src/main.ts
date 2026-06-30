import Chart from "chart.js/auto";
import "./styles.css";
import { api, isDemoMode, setBearerToken } from "./api";
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
  CampaignDashboard,
  CampaignBrief,
  CampaignProposal,
  ChannelDashboardRow,
  DashboardChannelFilter,
  DashboardMetric,
  DashboardPeriod,
  EstimateRange,
  ImprovementCycle,
  MetricSeriesPoint,
  LegalCheckResult,
  MetricSnapshot,
  Role,
  RoleAssignment,
  RouteName,
  UiError,
} from "./types";
import type { AppState, LoadingOperation, LoadingState } from "./store";

const routes: Array<{ id: RouteName; label: string; icon: string; roles: Role[] }> = [
  { id: "home", label: "ホーム", roles: ["viewer", "approver", "operator", "admin"], icon: '<path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />' },
  { id: "campaigns", label: "広告案", roles: ["operator", "admin"], icon: '<rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" />' },
  { id: "dashboard", label: "成果", roles: ["viewer", "approver", "operator", "admin"], icon: '<path d="M4 19V5" /><path d="M4 19h16" /><path d="m8 15 3-4 3 2 4-7" />' },
  { id: "tasks", label: "確認待ち", roles: ["viewer", "approver", "operator", "admin"], icon: '<path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />' },
  { id: "creative", label: "広告素材", roles: ["operator", "admin"], icon: '<rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="m21 15-5-5L5 21" />' },
  { id: "audit", label: "記録", roles: ["operator", "admin"], icon: '<path d="M12 3 4 7v6c0 5 8 8 8 8s8-3 8-8V7l-8-4Z" /><path d="m9 12 2 2 4-4" />' },
  { id: "roles", label: "ロール管理", roles: ["admin"], icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" />' },
  { id: "settings", label: "設定", roles: ["admin"], icon: '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 1.6V1a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />' },
];

let chart: Chart | null = null;
let chartSignature: string | null = null;
let lastFocusedBeforeModal: HTMLElement | null = null;
const viewSignatures = new Map<string, string>();
const dashboardFilterStorageKey = "tact-dashboard-filters";

const productPlaceholderExamples = [
  "法人向け勤怠管理ツール",
  "製造業向けIoTセンサー",
  "人材紹介サービス",
  "地域密着の歯科クリニック",
  "オンライン英会話サービス",
  "D2C冷凍弁当ブランド",
  "注文住宅の工務店",
  "相続に強い会計事務所",
  "中古車販売店",
  "法人向けセキュリティ診断",
  "不動産投資スクール",
  "24時間フィットネスジム",
  "ECモールの季節商品",
  "クラフトビール専門店",
  "マーケター向けウェビナー",
  "業務効率化SaaS",
  "地方ホテルの宿泊プラン",
  "資格取得スクール",
  "医療機器メーカー",
  "家計簿アプリ",
];

interface CampaignObjectiveOption {
  id: string;
  label: string;
  kpiLabel: string;
  kpis: string[];
  channels: string[];
}

const campaignObjectiveOptions: CampaignObjectiveOption[] = [
  {
    id: "conversion",
    label: "売上・購入",
    kpiLabel: "ROAS・購入数・売上額",
    kpis: ["conversion_value_jpy", "roas", "conversions"],
    channels: ["search", "social", "display"],
  },
  {
    id: "lead_generation",
    label: "見込み顧客",
    kpiLabel: "リード数・獲得単価・送信数",
    kpis: ["qualified_leads", "cost_per_lead", "lead_form_submissions"],
    channels: ["search", "social", "display"],
  },
  {
    id: "traffic",
    label: "サイト訪問",
    kpiLabel: "クリック数・CTR・CPC",
    kpis: ["clicks", "ctr", "cpc_jpy"],
    channels: ["search", "display", "social"],
  },
  {
    id: "awareness",
    label: "認知拡大",
    kpiLabel: "表示回数・リーチ・CPM",
    kpis: ["impressions", "reach", "cpm_jpy"],
    channels: ["display", "social", "search"],
  },
  {
    id: "local_visits",
    label: "来店・予約",
    kpiLabel: "来店数・予約数・来店単価",
    kpis: ["store_visits", "reservations", "cost_per_visit"],
    channels: ["search", "display", "social"],
  },
  {
    id: "app_promotion",
    label: "アプリ獲得",
    kpiLabel: "インストール・獲得単価・利用",
    kpis: ["installs", "cost_per_install", "in_app_actions"],
    channels: ["social", "display", "search"],
  },
];

type DataIntegrationStatus = "unconnected" | "connected" | "test" | "error" | "coming_soon";

interface DataIntegration {
  key: string;
  name: string;
  purpose: string;
  status: DataIntegrationStatus;
}

interface DataIntegrationGroup {
  title: string;
  integrations: DataIntegration[];
}

const dataIntegrationGroups: DataIntegrationGroup[] = [
  {
    title: "計測・解析",
    integrations: [
      {
        key: "ga4",
        name: "Googleアナリティクス（GA4）",
        purpose: "広告後の訪問数と成果を確認します。",
        status: "test",
      },
      {
        key: "search_console",
        name: "Google Search Console",
        purpose: "検索からの流入や表示回数を確認します。",
        status: "coming_soon",
      },
      {
        key: "meta_pixel",
        name: "Metaピクセル",
        purpose: "Facebook・Instagram経由の成果を確認します。",
        status: "coming_soon",
      },
    ],
  },
  {
    title: "ネットショップ・決済",
    integrations: [
      {
        key: "shopify",
        name: "Shopify",
        purpose: "注文数と売上を確認します。",
        status: "test",
      },
      {
        key: "base",
        name: "BASE",
        purpose: "ショップの注文と売上を確認します。",
        status: "coming_soon",
      },
      {
        key: "stores",
        name: "STORES",
        purpose: "ショップの注文と売上を確認します。",
        status: "coming_soon",
      },
      {
        key: "rakuten",
        name: "楽天市場",
        purpose: "モール内の売上と広告成果を確認します。",
        status: "coming_soon",
      },
      {
        key: "amazon",
        name: "Amazon",
        purpose: "Amazon内の売上と広告成果を確認します。",
        status: "coming_soon",
      },
      {
        key: "stripe",
        name: "Stripe",
        purpose: "決済と売上の数字を確認します。",
        status: "coming_soon",
      },
    ],
  },
  {
    title: "広告媒体",
    integrations: [
      {
        key: "google_ads",
        name: "Google広告",
        purpose: "広告アカウントへの送信先を管理します。",
        status: "test",
      },
      {
        key: "yahoo_ads",
        name: "Yahoo!広告",
        purpose: "Yahoo!広告の配信先を管理します。",
        status: "coming_soon",
      },
      {
        key: "meta_ads",
        name: "Meta広告（Facebook/Instagram）",
        purpose: "Facebook・Instagram広告の配信先を管理します。",
        status: "coming_soon",
      },
      {
        key: "x_ads",
        name: "X広告",
        purpose: "X広告の配信先を管理します。",
        status: "coming_soon",
      },
      {
        key: "tiktok_ads",
        name: "TikTok広告",
        purpose: "TikTok広告の配信先を管理します。",
        status: "coming_soon",
      },
      {
        key: "line_ads",
        name: "LINE広告",
        purpose: "LINE広告の配信先を管理します。",
        status: "coming_soon",
      },
      {
        key: "microsoft_ads",
        name: "Microsoft広告",
        purpose: "Microsoft広告の配信先を管理します。",
        status: "coming_soon",
      },
    ],
  },
  {
    title: "顧客・連絡",
    integrations: [
      {
        key: "line_official",
        name: "LINE公式アカウント",
        purpose: "友だち追加やメッセージ配信を確認します。",
        status: "coming_soon",
      },
      {
        key: "mailchimp",
        name: "Mailchimp",
        purpose: "メール配信と反応を確認します。",
        status: "coming_soon",
      },
    ],
  },
];

function el<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element == null) throw new Error(`Missing element #${id}`);
  return element as T;
}

function renderNav(): void {
  const role = getState().role;
  el("nav-list").innerHTML = routes
    .filter((route) => route.roles.includes(role))
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
  const state = getState();
  if (!canAccessRoute(route, state.role)) {
    setState({
      route: defaultRouteForRole(state.role),
      error: {
        status: 403,
        message: `この画面は${requiredRoleLabel(route)}のみ表示できます。`,
        detail: "route forbidden",
      },
    });
    return;
  }
  setState({ route, error: null });
  if (route === "audit") void loadAudit();
  if (route === "roles") void loadRoles();
  if (route === "dashboard") void loadDashboard();
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
  renderIfChanged("dashboard", dashboardSignature(state), renderDashboard);
  renderIfChanged("audit", auditSignature(state), renderAudit);
  renderIfChanged("roles", rolesSignature(state), renderRoles);
  renderIfChanged("settings", settingsSignature(state), renderSettings);
}

function renderShell(state: AppState): void {
  renderNav();
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
  syncDashboardActionStates(state);
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
  if (role === "viewer") return "閲覧者";
  if (role === "approver") return "承認者";
  if (role === "admin") return "管理者";
  return "担当者";
}

function roleSurfaceLabel(role: Role): string {
  if (role === "admin") return "管理面";
  if (role === "operator") return "運用面";
  return "顧客面";
}

function canCreateCampaign(role: Role): boolean {
  return role === "operator" || role === "admin";
}

function canApproveCampaign(role: Role): boolean {
  return role === "approver" || role === "admin";
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

function dashboardSignature(state: AppState): string {
  return JSON.stringify({
    campaignId: activeOrLatest()?.id ?? null,
    dashboard: state.dashboard,
    filters: state.dashboardFilters,
    loading: loadingSignature(state, [
      "loadDashboard",
      "checkKillSwitch",
      "requestKillSwitchStop",
    ]),
    failedOperation: state.failedOperation,
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

function rolesSignature(state: AppState): string {
  return JSON.stringify({
    role: state.role,
    assignments: state.roleAssignments,
    loading: loadingSignature(state, ["loadRoles", "updateRoleAssignment"]),
    failedOperation: state.failedOperation,
  });
}

function canAccessRoute(route: RouteName, role: Role): boolean {
  return routes.find((item) => item.id === route)?.roles.includes(role) === true;
}

function defaultRouteForRole(role: Role): RouteName {
  if (role === "viewer" || role === "approver") return "dashboard";
  if (role === "admin") return "dashboard";
  return "home";
}

function requiredRoleLabel(route: RouteName): string {
  const allowed = routes.find((item) => item.id === route)?.roles ?? [];
  return allowed.map(roleLabel).join("・");
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
  const canCreate = canCreateCampaign(state.role);
  const form = el<HTMLFormElement>("campaign-form");
  form.hidden = !canCreate;
  renderCustomerHomeSummary(!canCreate);
  el("home-title").innerHTML = canCreate
    ? `広告づくりを、4問から。<br /><span>出す前の確認まで、ひとつずつ進めます。</span>`
    : `成果と確認待ちを、ひとつずつ確認します。`;
  if (!canCreate) return;
  const busy = isLoading("createCampaign");
  const disabled = state.loading != null || state.devTokenAvailable !== true;
  form
    .querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input")
    .forEach((control) => {
      control.disabled = disabled;
    });
  el<HTMLButtonElement>("create-button").innerHTML = busy
    ? `${spinner()} 作成中...`
    : `広告案を作成する ${arrowIcon()}`;
}

function renderCustomerHomeSummary(visible: boolean): void {
  let summary = document.getElementById("customer-home-summary");
  if (summary == null) {
    summary = document.createElement("section");
    summary.id = "customer-home-summary";
    summary.className = "customer-home-summary";
    el("campaign-form").before(summary);
  }
  summary.hidden = !visible;
  if (!visible) return;
  const campaign = activeOrLatest();
  summary.innerHTML = campaign == null
    ? emptyState("確認できる広告案はまだありません", "広告案が作成されると、成果と確認待ちをここから確認できます。")
    : `
      <article class="setting-card settings-wide">
        <span class="data-label forecast">${escapeHtml(roleSurfaceLabel(getState().role))}</span>
        <h3>${escapeHtml(campaign.brief.name)}</h3>
        <p>成果と確認待ちを確認できます。作成や設定は運用担当または管理者が行います。</p>
        <div class="action-cluster card-action">
          <button class="btn primary" type="button" data-route="dashboard">成果を見る</button>
          <button class="btn ghost" type="button" data-route="tasks">確認待ちを見る</button>
        </div>
      </article>
    `;
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
      detail: campaign == null ? "4問に答える" : campaign.brief.name,
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
    content.innerHTML = emptyState("まだ広告案がありません", "ホームから4問に答えると、作成された広告案だけがここに表示されます。");
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
    content.innerHTML = emptyState("広告案はまだありません", "ホームから4問に答えると、広告文と配信先の案を作成します。");
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
  const objective = objectiveOption(campaign.brief.objective);
  const totalPlacementBudget = campaign.media_plan.placements.reduce(
    (total, placement) => total + placement.budget_jpy,
    0,
  );
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
      <div class="objective-summary">
        <span class="data-label forecast">${escapeHtml(objective.label)}</span>
        <span>${escapeHtml(objective.kpiLabel)} を見て、媒体配分を組みます。</span>
      </div>
      ${campaign.media_plan.placements
        .map((placement) => placementRow(placement, totalPlacementBudget))
        .join("")}
    </div>
    <div class="out in">
      <h3>成果の目安 <span class="data-label forecast">予測 / 自動推定</span></h3>
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

function placementRow(
  placement: { channel: string; budget_jpy: number },
  totalBudget: number,
): string {
  const share = totalBudget > 0 ? Math.round((placement.budget_jpy / totalBudget) * 100) : 0;
  const fillWidth = Math.max(3, Math.min(100, share));
  return `
    <div class="alloc-row">
      <span class="nm">${escapeHtml(channelLabel(placement.channel))}</span>
      <span class="track"><span class="fill" style="width:${safeAttr(String(fillWidth))}%"></span></span>
      <span class="pct">${formatYen(placement.budget_jpy)} / ${escapeHtml(String(share))}%</span>
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
  const canApprove = canApproveCampaign(getState().role);
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
          <p>${canApprove ? "数字と表現の確認は完了済み。広告を出す最終確認ができます。" : "数字と表現の確認は完了済み。承認操作は承認者または管理者のみです。"}</p>
        </div>
        ${
          canApprove
            ? `<button class="btn primary" type="button" data-approve-action="${safeAttr(pending.id)}" ${actionDisabled ? "disabled" : ""}>
                ${approveBusy ? `${spinner()} 処理中...` : "広告を出すことを承認"}
              </button>`
            : `<span class="status-pill amber">承認者・管理者のみ</span>`
        }
      </article>
      ${approveBusy ? loadingPanel("承認を送信中...") : ""}
    </div>
  `;
}

function renderDashboard(): void {
  const campaign = activeOrLatest();
  const state = getState();
  const content = el("dashboard-content");
  if (campaign == null) {
    content.innerHTML = emptyState(
      "成果はまだありません",
      isDemoMode
        ? "広告案を作成すると、テスト用の数字をここで確認できます。"
        : "広告案を作成すると、予測や実データの数字をここで確認できます。",
    );
    destroyChart();
    return;
  }
  const dashboard = state.dashboard?.campaign_id === campaign.id ? state.dashboard : null;
  if (dashboard == null) {
    content.innerHTML = `
      <div class="dash-head">
        <div>
          <span class="data-label pending">集計待ち</span>
          <h3>${escapeHtml(campaign.brief.name)}</h3>
          <p>サーバーで成果画面の集計を確認しています。</p>
        </div>
      </div>
      ${loadingPanel("成果データを読み込み中...")}
    `;
    destroyChart();
    return;
  }
  content.innerHTML = `
    <div class="dash-head">
      <div>
        <span class="data-label ${dashboardHasMeasuredData(dashboard) ? "forecast" : "pending"}">${escapeHtml(dashboardStateLabel(dashboard))}</span>
        <h3>${escapeHtml(dashboard.campaign_name)}</h3>
        <p>${campaign.publish_result == null ? "広告を出す前の確認中" : "広告を出した状態 / テスト用の結果"}</p>
      </div>
      <div class="dashboard-controls" aria-label="成果フィルタ">
        ${periodButtons(dashboard.period)}
        ${channelButtons(dashboard.channel_filter)}
      </div>
    </div>
    <div class="dash-top" aria-label="主要な成果">
      ${dashboard.kpis.map(kpiCard).join("")}
    </div>
    <div class="dashboard-grid">
      <section class="dashboard-panel chart-panel" aria-labelledby="dashboard-chart-title">
        <div class="sec-title" id="dashboard-chart-title">成果推移<span class="hint live">${escapeHtml(chartHint(dashboard))}</span></div>
        ${chartMarkup(dashboard)}
      </section>
      <section class="dashboard-panel" aria-labelledby="channel-status-title">
        <div class="sec-title" id="channel-status-title">媒体別ステータス<span class="hint">source付き</span></div>
        <div class="channel-status-list">
          ${dashboard.channels.map(channelStatusRow).join("") || `<div class="chart-empty">選択中の媒体には配信案がありません。</div>`}
        </div>
      </section>
      <section class="dashboard-panel" aria-labelledby="loop-history-title">
        <div class="sec-title" id="loop-history-title">改善ループ履歴<span class="hint">捏造提案なし</span></div>
        <div class="loop-timeline">
          ${dashboard.improvement_cycles.map(improvementCycleRow).join("")}
        </div>
      </section>
      <section class="dashboard-panel kill-panel" aria-labelledby="kill-switch-title">
        ${killSwitchPanel(dashboard)}
      </section>
    </div>
    <div class="guardrail">
      <span class="gi">!</span>
      <div class="gt"><b>データの扱い:</b> 履歴の線はサーバーから系列が供給された時だけ表示します。欠損点は補間せず「データなし」として扱います。</div>
    </div>
  `;
  renderChart(dashboard);
  syncDashboardActionStates(state);
}

function renderChart(dashboard: CampaignDashboard | null): void {
  const canvas = document.getElementById("performance-chart") as HTMLCanvasElement | null;
  const conversions = dashboard == null ? null : dashboardMetric(dashboard, "conversions");
  if (canvas == null || dashboard == null || conversions == null) {
    destroyChart();
    return;
  }
  const series = conversions.series;
  const hasSeries = series.some((point) => point.value != null);
  const chartType = hasSeries ? "line" : "bar";
  const nextSignature = JSON.stringify({
    campaignId: dashboard.campaign_id,
    period: dashboard.period,
    channel: dashboard.channel_filter,
    type: chartType,
    value: conversions.value,
    series,
  });
  if (chart != null && chart.canvas === canvas && chartSignature === nextSignature) return;
  destroyChart();
  chart = new Chart(canvas, {
    type: chartType,
    data: {
      labels: hasSeries
        ? series.map((point) => shortDate(point.timestamp))
        : ["現在値"],
      datasets: [
        {
          label: metricSourceLabel(conversions),
          data: hasSeries
            ? series.map((point) => point.value)
            : [conversions.value ?? 0],
          borderColor: "#2f6bff",
          backgroundColor: hasSeries ? "rgba(47,107,255,.10)" : "rgba(47,107,255,.18)",
          borderWidth: 2,
          pointRadius: hasSeries ? 3 : 0,
          tension: 0.22,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#566173",
            boxWidth: 12,
            usePointStyle: true,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#566173" },
        },
        y: {
          beginAtZero: true,
          grid: { color: "#e6eaf1" },
          ticks: { color: "#566173" },
        },
      },
    },
  });
  chartSignature = nextSignature;
}

function destroyChart(): void {
  chart?.destroy();
  chart = null;
  chartSignature = null;
}

function periodButtons(current: DashboardPeriod): string {
  const options: Array<{ value: DashboardPeriod; label: string }> = [
    { value: "7d", label: "7日" },
    { value: "28d", label: "28日" },
    { value: "all", label: "全期間" },
  ];
  return `
    <div class="segmented-control" aria-label="期間">
      ${options
        .map(
          (option) => `
            <button class="segment-button ${option.value === current ? "active" : ""}" type="button" data-dashboard-period="${safeAttr(option.value)}" aria-pressed="${option.value === current}">
              ${escapeHtml(option.label)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function channelButtons(current: DashboardChannelFilter): string {
  const options: Array<{ value: DashboardChannelFilter; label: string }> = [
    { value: "all", label: "全体" },
    { value: "search", label: "検索" },
    { value: "social", label: "SNS" },
    { value: "display", label: "バナー" },
  ];
  return `
    <div class="segmented-control" aria-label="媒体">
      ${options
        .map(
          (option) => `
            <button class="segment-button ${option.value === current ? "active" : ""}" type="button" data-dashboard-channel="${safeAttr(option.value)}" aria-pressed="${option.value === current}">
              ${escapeHtml(option.label)}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function kpiCard(metric: DashboardMetric): string {
  return `
    <article class="kpi-card">
      <span class="data-label ${metricBadgeClass(metric)}">${escapeHtml(metricSourceLabel(metric))}</span>
      <h4>${escapeHtml(metric.label)}</h4>
      <b>${escapeHtml(formatDashboardMetricValue(metric))}</b>
      <small>${escapeHtml(metricDetail(metric))}</small>
    </article>
  `;
}

function chartMarkup(dashboard: CampaignDashboard): string {
  const conversions = dashboardMetric(dashboard, "conversions");
  if (conversions == null || conversions.value == null) {
    destroyChart();
    return `<div class="chart-empty">計測が入るまで、成果のグラフは表示しません。</div>`;
  }
  const hasSeries = conversions.series.some((point) => point.value != null);
  return `
    <div class="chart-frame">
      <canvas id="performance-chart" aria-label="コンバージョンの成果グラフ" aria-describedby="performance-chart-alt"></canvas>
    </div>
    <p class="sr-only" id="performance-chart-alt">${escapeHtml(chartAlternativeText(conversions))}</p>
    ${hasSeries ? chartDataTable(conversions.series) : currentValueTable(conversions)}
  `;
}

function chartHint(dashboard: CampaignDashboard): string {
  const conversions = dashboardMetric(dashboard, "conversions");
  if (conversions == null || conversions.value == null) return "計測待ち";
  if (conversions.series.some((point) => point.value != null)) {
    return `${metricSourceLabel(conversions)} / 履歴あり`;
  }
  return `${metricSourceLabel(conversions)} / 履歴未接続・現在値`;
}

function chartAlternativeText(metric: DashboardMetric): string {
  if (metric.series.some((point) => point.value == null)) {
    return "コンバージョンの履歴です。値がない日はデータなしとして表示し、補間していません。";
  }
  if (metric.series.length > 0) {
    return "コンバージョンの履歴です。サーバーから供給された系列だけを表示しています。";
  }
  return `現在のコンバージョンは${formatDashboardMetricValue(metric)}です。履歴系列は未接続です。`;
}

function chartDataTable(points: MetricSeriesPoint[]): string {
  return `
    <div class="chart-data-table" role="table" aria-label="グラフの元データ">
      ${points
        .map(
          (point) => `
            <span role="row">
              <b role="cell">${escapeHtml(shortDate(point.timestamp))}</b>
              <small role="cell">${escapeHtml(point.value == null ? "データなし" : formatNumber(point.value))}</small>
            </span>
          `,
        )
        .join("")}
    </div>
  `;
}

function currentValueTable(metric: DashboardMetric): string {
  return `
    <div class="chart-data-table" role="table" aria-label="グラフの元データ">
      <span role="row">
        <b role="cell">現在値</b>
        <small role="cell">${escapeHtml(formatDashboardMetricValue(metric))}</small>
      </span>
    </div>
  `;
}

function channelStatusRow(row: ChannelDashboardRow): string {
  return `
    <article class="channel-row">
      <div class="channel-main">
        <span class="data-label ${channelStatusClass(row.status)}">${escapeHtml(channelStatusLabel(row.status))}</span>
        <h4>${escapeHtml(row.label)}</h4>
      </div>
      <div class="channel-metrics">
        ${channelMetricCell(row.planned_budget_jpy)}
        ${channelMetricCell(row.ad_spend_jpy)}
        ${channelMetricCell(row.roas)}
        ${channelMetricCell(row.cpa_jpy)}
        ${channelMetricCell(row.conversions)}
      </div>
      <div class="sparkline-wrap" aria-label="${safeAttr(`${row.label}の履歴`)}">
        ${row.series.some((point) => point.value != null) ? sparklineSvg(row.series) : `<span class="sparkline-empty">履歴なし</span>`}
      </div>
    </article>
  `;
}

function channelMetricCell(metric: DashboardMetric): string {
  return `
    <span class="channel-metric">
      <b>${escapeHtml(formatDashboardMetricValue(metric))}</b>
      <small>${escapeHtml(metric.label)} / ${escapeHtml(metricSourceLabel(metric))}</small>
    </span>
  `;
}

function sparklineSvg(points: MetricSeriesPoint[]): string {
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => value != null);
  if (values.length === 0) return `<span class="sparkline-empty">履歴なし</span>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const width = 120;
  const height = 34;
  const step = points.length <= 1 ? width : width / (points.length - 1);
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.value == null) {
      if (current.length > 0) segments.push(current.join(" "));
      current = [];
      return;
    }
    const x = Math.round(index * step * 100) / 100;
    const y = Math.round((height - ((point.value - min) / range) * (height - 8) - 4) * 100) / 100;
    current.push(`${x},${y}`);
  });
  if (current.length > 0) segments.push(current.join(" "));
  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" role="img" aria-label="供給された履歴だけを線で表示">
      ${segments
        .map((segment) =>
          segment.includes(" ")
            ? `<polyline points="${safeAttr(segment)}"></polyline>`
            : `<circle cx="${safeAttr(segment.split(",")[0])}" cy="${safeAttr(segment.split(",")[1])}" r="2.5"></circle>`,
        )
        .join("")}
    </svg>
  `;
}

function improvementCycleRow(cycle: ImprovementCycle): string {
  const source = cycle.source == null ? "提案なし" : sourceText(cycle.source, cycle.data_kind);
  const canOpenEvidence = cycle.evidence_event_type != null && canAccessRoute("audit", getState().role);
  return `
    <article class="loop-item ${safeAttr(cycle.stage)}">
      <span class="loop-dot" aria-hidden="true"></span>
      <div>
        <span class="data-label ${cycle.source == null ? "pending" : "forecast"}">${escapeHtml(source)}</span>
        <h4>${escapeHtml(cycle.title)}</h4>
        <p>${escapeHtml(cycle.changed)}</p>
        <small>${escapeHtml(cycle.result)}</small>
      </div>
      ${
        !canOpenEvidence
          ? ""
          : `<button class="btn ghost loop-evidence" type="button" data-route="audit">根拠</button>`
      }
    </article>
  `;
}

function killSwitchPanel(dashboard: CampaignDashboard): string {
  const state = getState();
  const kill = dashboard.kill_switch;
  const checkedAt =
    kill.checked_at == null ? "未確認" : new Date(kill.checked_at).toLocaleString("ja-JP");
  const busyCheck = isLoading("checkKillSwitch", dashboard.campaign_id);
  const busyStop = isLoading("requestKillSwitchStop", dashboard.campaign_id);
  const disableAll = state.loading != null || state.devTokenAvailable !== true;
  const canCheck = state.role !== "viewer";
  const canStop = state.role === "approver" || state.role === "admin";
  return `
    <div class="sec-title" id="kill-switch-title">Kill Switch<span class="hint">監査記録あり</span></div>
    <div class="kill-state">
      <span class="data-label ${killSwitchClass(kill.status)}">${escapeHtml(kill.label)}</span>
      <h4>現在状態</h4>
      <p>${escapeHtml(kill.reason)}</p>
      <small>${escapeHtml(`${kill.source == null ? "サーバー確認待ち" : sourceText(kill.source, kill.data_kind)} / ${checkedAt}`)}</small>
    </div>
    <div class="kill-actions">
      <button class="btn ghost" type="button" data-kill-check="${safeAttr(dashboard.campaign_id)}" ${disableAll || !canCheck ? "disabled" : ""}>
        ${busyCheck ? `${spinner()} 確認中...` : "状態を確認"}
      </button>
      <button class="btn primary" type="button" data-kill-stop="${safeAttr(dashboard.campaign_id)}" ${disableAll || !canStop ? "disabled" : ""}>
        ${busyStop ? `${spinner()} 処理中...` : "止める想定"}
      </button>
    </div>
    <p class="kill-note">テスト用媒体では実停止ではなく、止める想定の確認として監査に残します。</p>
  `;
}

function syncDashboardActionStates(state: AppState): void {
  const canCheck = state.role !== "viewer";
  const canStop = state.role === "approver" || state.role === "admin";
  document.querySelectorAll<HTMLButtonElement>("[data-kill-stop]").forEach((button) => {
    const busy = isLoading("requestKillSwitchStop", button.dataset.killStop);
    button.disabled = state.loading != null || state.devTokenAvailable !== true || !canStop;
    button.title = canStop ? "止める想定を監査に残す" : "承認者または管理者だけが操作できます";
    button.innerHTML = busy ? `${spinner()} 処理中...` : "止める想定";
  });
  document.querySelectorAll<HTMLButtonElement>("[data-kill-check]").forEach((button) => {
    const busy = isLoading("checkKillSwitch", button.dataset.killCheck);
    button.disabled = state.loading != null || state.devTokenAvailable !== true || !canCheck;
    button.title = canCheck ? "サーバーで状態を確認" : "閲覧者は状態確認を実行できません";
    button.innerHTML = busy ? `${spinner()} 確認中...` : "状態を確認";
  });
}

function dashboardMetric(
  dashboard: CampaignDashboard,
  key: DashboardMetric["key"],
): DashboardMetric | null {
  return dashboard.kpis.find((metric) => metric.key === key) ?? null;
}

function dashboardHasMeasuredData(dashboard: CampaignDashboard): boolean {
  return dashboard.kpis.some((metric) => metric.value != null && metric.source != null);
}

function dashboardStateLabel(dashboard: CampaignDashboard): string {
  const spend = dashboardMetric(dashboard, "ad_spend_jpy");
  if (spend == null || spend.value == null) return "計測待ち";
  return metricSourceLabel(spend);
}

function formatDashboardMetricValue(metric: DashboardMetric): string {
  if (metric.value == null) {
    if (metric.status === "measurement_pending") return "計測待ち";
    return "データなし";
  }
  if (metric.unit === "jpy") return formatYen(metric.value);
  if (metric.unit === "ratio") return `${metric.value.toFixed(2)}倍`;
  return formatNumber(metric.value);
}

function metricDetail(metric: DashboardMetric): string {
  if (metric.value == null) return "サーバー確認待ち";
  const range = metric.estimate_range == null ? "" : ` / ${estimateRangeLabel(metric)}`;
  return `${metricSourceLabel(metric)}${range}`;
}

function estimateRangeLabel(metric: DashboardMetric): string {
  const range = metric.estimate_range;
  if (range == null) return "";
  if (metric.unit === "ratio") return `目安 ${range.low.toFixed(2)}〜${range.high.toFixed(2)}倍`;
  if (metric.unit === "jpy") return `目安 ${formatYen(range.low)}〜${formatYen(range.high)}`;
  return `目安 ${formatNumber(range.low)}〜${formatNumber(range.high)}`;
}

function metricSourceLabel(metric: DashboardMetric): string {
  if (metric.source == null) {
    if (metric.status === "measurement_pending") return "計測待ち";
    return "データなし";
  }
  return sourceText(metric.source, metric.data_kind);
}

function sourceText(source: string, dataKind: string | null): string {
  if (isDemoMode) return "テスト用";
  if (source === "ga4_shopify") return "実データ";
  if (source === "media_plan_mock") return "テスト用";
  if (source === "media_plan_model") return "自動推定";
  if (source === "ga4_shopify_mock" || source === "mock_media") return "テスト用";
  if (dataKind === "measured") return "実データ";
  return "自動推定";
}

function metricBadgeClass(metric: DashboardMetric): string {
  if (metric.value == null || metric.source == null) return "pending";
  if (metric.data_kind === "measured") return "forecast";
  return "amber";
}

function channelStatusLabel(status: ChannelDashboardRow["status"]): string {
  if (status === "pending") return "確認待ち";
  if (status === "stopped") return "停止想定";
  if (status === "test") return "テスト用";
  return "配信中";
}

function channelStatusClass(status: ChannelDashboardRow["status"]): string {
  if (status === "pending") return "pending";
  if (status === "stopped") return "amber";
  if (status === "test") return "amber";
  return "forecast";
}

function killSwitchClass(status: CampaignDashboard["kill_switch"]["status"]): string {
  if (status === "not_checked") return "pending";
  if (status === "would_stop" || status === "stopped") return "amber";
  return "forecast";
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
  });
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("ja-JP");
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
    "campaign.kill_switch.stop_requested": "止める想定を確認",
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
    "campaign.kill_switch.stop_requested": "緊急停止の止める想定を確認しました。テスト用のため実停止は行っていません。",
  };
  return summaries[entry.event_type] ?? entry.summary;
}

function renderRoles(): void {
  const state = getState();
  const content = el("roles-content");
  if (state.role !== "admin") {
    content.innerHTML = emptyState("管理者のみ表示できます", "ロール管理は管理者だけが操作できます。");
    return;
  }
  if (isLoading("loadRoles")) {
    content.innerHTML = loadingPanel("ロール管理を読み込み中...");
    return;
  }
  content.innerHTML = `
    <div class="role-admin-grid">
      ${state.roleAssignments.map(roleAssignmentRow).join("") || emptyState("ロール登録がありません", "管理対象が追加されるとここに表示します。")}
    </div>
  `;
}

function roleAssignmentRow(assignment: RoleAssignment): string {
  const current = assignment.roles[0] ?? "viewer";
  const busy = isLoading("updateRoleAssignment", assignment.actor_id);
  const roleOptions: Role[] = ["viewer", "approver", "operator", "admin"];
  return `
    <article class="setting-card role-card">
      <div class="setting-head">
        <div>
          <span class="data-label forecast">${escapeHtml(assignment.surface)}</span>
          <h3>${escapeHtml(assignment.display_name)}</h3>
          <p>${escapeHtml(assignment.actor_id)}</p>
        </div>
        <span class="status-pill neutral">${escapeHtml(roleLabel(current))}</span>
      </div>
      <div class="role-choice-row" aria-label="${safeAttr(`${assignment.display_name}のロール`)}">
        ${roleOptions
          .map(
            (role) => `
              <button class="segment-button ${role === current ? "active" : ""}" type="button" data-role-update="${safeAttr(assignment.actor_id)}" data-next-role="${safeAttr(role)}" ${busy || role === current ? "disabled" : ""}>
                ${busy && role !== current ? "" : escapeHtml(roleLabel(role))}
              </button>
            `,
          )
          .join("")}
      </div>
      <p class="setting-note">ロール変更は監査に保存します。鍵や個人情報は表示しません。</p>
    </article>
  `;
}

function renderSettings(): void {
  const state = getState();
  const canManageIntegrations = state.devTokenAvailable === true && state.role === "admin";
  const integrationIntro = isDemoMode
    ? "外部連携の見本画面です。数字はすべてテスト用として表示します。"
    : "実データにつなぐ準備画面です。今はテスト用の数字として表示します。";
  const salesAccessIntro = isDemoMode
    ? "このデモではテスト用の数字だけを表示します。接続操作も実行されません。"
    : "今はテスト用の数字で確認中です。実データ連携までは、画面上もテスト用と表示します。";
  el("settings-content").innerHTML = `
    <div class="settings-grid">
      <article class="setting-card settings-wide">
        <div class="setting-head">
          <div>
            <h3>データ連携</h3>
            <p>${escapeHtml(integrationIntro)}</p>
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
        <p>${escapeHtml(salesAccessIntro)}</p>
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
  return dataIntegrationGroups
    .map(
      (group) => `
        <section class="integration-group" aria-label="${safeAttr(group.title)}">
          <h4>${escapeHtml(group.title)}</h4>
          ${group.integrations
            .map(
              (integration) => `
                <div class="integration-row">
                  <div class="integration-meta">
                    <strong>${escapeHtml(integration.name)}</strong>
                    <span>${escapeHtml(integration.purpose)}</span>
                  </div>
                  <span class="badge ${integrationBadgeClass(integration.status)}" data-integration-status="${safeAttr(integration.status)}">${escapeHtml(integrationStatusLabel(integration.status))}</span>
                  ${integrationAction(integration, canManageIntegrations)}
                </div>
              `,
            )
            .join("")}
        </section>
      `,
    )
    .join("");
}

function integrationAction(integration: DataIntegration, canManageIntegrations: boolean): string {
  if (integration.status === "coming_soon") {
    return `<span class="integration-action integration-action-static" aria-disabled="true">準備中</span>`;
  }
  const disabled = canManageIntegrations ? "" : " disabled";
  const title = canManageIntegrations
    ? "接続手順を確認"
    : "管理者だけが接続できます";
      return `
        <button class="btn ghost integration-action" type="button" data-integration-connect="${safeAttr(integration.key)}" aria-label="${safeAttr(`${integration.name}を${integrationActionLabel(integration.status)}`)}" title="${safeAttr(title)}"${disabled}>${escapeHtml(integrationActionLabel(integration.status))}</button>
      `;
}

function integrationStatusLabel(status: DataIntegrationStatus): string {
  const labels: Record<DataIntegrationStatus, string> = {
    unconnected: "未接続",
    connected: "接続済み",
    test: "テスト用",
    error: "エラー",
    coming_soon: "準備中",
  };
  return labels[status];
}

function integrationBadgeClass(status: DataIntegrationStatus): string {
  if (status === "test") return "amber";
  if (status === "error") return "red";
  if (status === "coming_soon" || status === "unconnected") return "muted";
  return "";
}

function integrationActionLabel(status: DataIntegrationStatus): string {
  return status === "connected" || status === "error" ? "再接続" : "接続する";
}

function allDataIntegrations(): DataIntegration[] {
  return dataIntegrationGroups.flatMap((group) => group.integrations);
}

function startProductPlaceholderLoop(): void {
  const input = document.getElementById("product-input") as HTMLInputElement | null;
  if (input == null) return;
  let index = 0;
  const rotate = () => {
    if (input.value.trim() !== "") return;
    input.placeholder = `例：${productPlaceholderExamples[index]}`;
    index = (index + 1) % productPlaceholderExamples.length;
  };
  rotate();
  window.setInterval(rotate, 2200);
}

function objectiveOption(id: string): CampaignObjectiveOption {
  const normalized = id === "efficiency" ? "conversion" : id;
  return (
    campaignObjectiveOptions.find((option) => option.id === normalized) ??
    campaignObjectiveOptions[0]
  );
}

function selectedObjectiveOption(): CampaignObjectiveOption {
  const selected =
    document.querySelector<HTMLButtonElement>(".objective-card.selected")?.dataset
      .objective ?? "conversion";
  return objectiveOption(selected);
}

async function bootstrap(): Promise<void> {
  applyDemoModeChrome();
  setState({ dashboardFilters: loadStoredDashboardFilters() });
  renderNav();
  startProductPlaceholderLoop();
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

    const objective = target.closest<HTMLButtonElement>(".objective-card");
    if (objective != null) selectWithin(objective, ".objective-card");

    const autonomy = target.closest<HTMLButtonElement>(".choice-card");
    if (autonomy != null) selectWithin(autonomy, ".choice-card");

    const integrationConnect = target.closest<HTMLButtonElement>("[data-integration-connect]");
    if (integrationConnect?.dataset.integrationConnect != null) {
      showIntegrationNotice(integrationConnect.dataset.integrationConnect);
    }

    const dashboardPeriod = target.closest<HTMLButtonElement>("[data-dashboard-period]");
    if (dashboardPeriod?.dataset.dashboardPeriod != null) {
      updateDashboardFilters({
        period: dashboardPeriod.dataset.dashboardPeriod as DashboardPeriod,
      });
    }

    const dashboardChannel = target.closest<HTMLButtonElement>("[data-dashboard-channel]");
    if (dashboardChannel?.dataset.dashboardChannel != null) {
      updateDashboardFilters({
        channel: dashboardChannel.dataset.dashboardChannel as DashboardChannelFilter,
      });
    }

    const killCheck = target.closest<HTMLButtonElement>("[data-kill-check]");
    if (killCheck?.dataset.killCheck != null) void checkKillSwitch(killCheck.dataset.killCheck);

    const killStop = target.closest<HTMLButtonElement>("[data-kill-stop]");
    if (killStop?.dataset.killStop != null) {
      void requestKillSwitchStop(killStop.dataset.killStop);
    }

    const roleUpdate = target.closest<HTMLButtonElement>("[data-role-update]");
    if (roleUpdate?.dataset.roleUpdate != null && roleUpdate.dataset.nextRole != null) {
      void updateRoleAssignment(
        roleUpdate.dataset.roleUpdate,
        roleUpdate.dataset.nextRole as Role,
      );
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
  const group = button.closest(".objective-grid, .choice-cards");
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
  selectByDataset(".objective-card", "objective", campaign.brief.objective);
  selectByDataset(".choice-card", "autonomy", campaign.brief.autonomy_level, "approval_only");
  setRoute("home");
  el<HTMLInputElement>("product-input").focus();
}

function selectByDataset(selector: string, key: string, value: string, fallbackValue?: string): void {
  const candidates = Array.from(document.querySelectorAll<HTMLButtonElement>(selector));
  const targetValue =
    selector === ".choice-card" && value === "full_auto"
      ? "approval_only"
      : selector === ".objective-card" && value === "efficiency"
        ? "conversion"
        : value;
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
  const integration = allDataIntegrations().find((item) => item.key === integrationKey);
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
    const route = canAccessRoute(getState().route, role)
      ? getState().route
      : defaultRouteForRole(role);
    const activeCampaignId = nextActiveCampaignId(campaigns);
    setState({
      role,
      route,
      auth,
      devTokenAvailable: true,
      campaigns,
      activeCampaignId,
      auditEntries: [],
      roleAssignments: [],
      loading: null,
      error: null,
    });
    if (getState().route === "audit") void loadAudit();
    if (getState().route === "roles") void loadRoles();
    if (getState().route === "dashboard") {
      const nextState = getState();
      if (nextState.dashboard?.campaign_id === nextState.activeCampaignId) {
        syncDashboardActionStates(nextState);
      } else {
        void loadDashboard();
      }
    }
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
    setState({ loading: null });
    setRoute("dashboard");
  } catch (error) {
    setState({ error: error as UiError, failedOperation: getState().loading, loading: null });
  }
}

function applyDemoModeChrome(): void {
  document.body.classList.toggle("demo-mode", isDemoMode);
  const banner = document.getElementById("demo-banner");
  if (banner != null) banner.hidden = !isDemoMode;
}

async function loadDashboard(): Promise<void> {
  const campaign = activeOrLatest();
  if (campaign == null) return;
  if (!beginOperation({ operation: "loadDashboard", targetId: campaign.id })) return;
  try {
    const dashboard = await fetchDashboard(campaign.id);
    setState({ dashboard, error: null, loading: null });
  } catch (error) {
    setState({ error: error as UiError, failedOperation: getState().loading, loading: null });
  }
}

async function checkKillSwitch(campaignId: string): Promise<void> {
  if (!beginOperation({ operation: "checkKillSwitch", targetId: campaignId })) return;
  try {
    await api.evaluateKillSwitch(campaignId);
    const dashboard = await fetchDashboard(campaignId);
    setState({ dashboard, error: null, loading: null });
  } catch (error) {
    setState({ error: error as UiError, failedOperation: getState().loading, loading: null });
  }
}

async function requestKillSwitchStop(campaignId: string): Promise<void> {
  if (!beginOperation({ operation: "requestKillSwitchStop", targetId: campaignId })) return;
  try {
    await api.requestKillSwitchStop(campaignId);
    const dashboard = await fetchDashboard(campaignId);
    setState({ dashboard, error: null, loading: null });
  } catch (error) {
    setState({ error: error as UiError, failedOperation: getState().loading, loading: null });
  }
}

async function loadRoles(): Promise<void> {
  if (!beginOperation({ operation: "loadRoles" })) return;
  try {
    const roleAssignments = await api.listRoles();
    setState({ roleAssignments, error: null, loading: null });
  } catch (error) {
    setState({ error: error as UiError, failedOperation: getState().loading, loading: null });
  }
}

async function updateRoleAssignment(actorId: string, role: Role): Promise<void> {
  if (!beginOperation({ operation: "updateRoleAssignment", targetId: actorId })) return;
  try {
    const updated = await api.updateRole(actorId, [role]);
    const current = getState().roleAssignments;
    setState({
      roleAssignments: current.map((assignment) =>
        assignment.actor_id === updated.actor_id ? updated : assignment,
      ),
      error: null,
      loading: null,
    });
  } catch (error) {
    setState({ error: error as UiError, failedOperation: getState().loading, loading: null });
  }
}

async function fetchDashboard(campaignId: string): Promise<CampaignDashboard> {
  const filters = getState().dashboardFilters;
  return api.getDashboard(campaignId, filters.period, filters.channel);
}

function updateDashboardFilters(
  patch: Partial<{ period: DashboardPeriod; channel: DashboardChannelFilter }>,
): void {
  const dashboardFilters = { ...getState().dashboardFilters, ...patch };
  saveDashboardFilters(dashboardFilters);
  setState({ dashboardFilters });
  void loadDashboard();
}

function loadStoredDashboardFilters(): {
  period: DashboardPeriod;
  channel: DashboardChannelFilter;
} {
  try {
    const raw = localStorage.getItem(dashboardFilterStorageKey);
    if (raw == null) return { period: "28d", channel: "all" };
    const parsed = JSON.parse(raw) as Partial<{
      period: DashboardPeriod;
      channel: DashboardChannelFilter;
    }>;
    return {
      period: isDashboardPeriod(parsed.period) ? parsed.period : "28d",
      channel: isDashboardChannel(parsed.channel) ? parsed.channel : "all",
    };
  } catch {
    return { period: "28d", channel: "all" };
  }
}

function saveDashboardFilters(filters: {
  period: DashboardPeriod;
  channel: DashboardChannelFilter;
}): void {
  try {
    localStorage.setItem(dashboardFilterStorageKey, JSON.stringify(filters));
  } catch {
    // The filters are a convenience only; server data remains the truth source.
  }
}

function isDashboardPeriod(value: unknown): value is DashboardPeriod {
  return value === "7d" || value === "28d" || value === "all";
}

function isDashboardChannel(value: unknown): value is DashboardChannelFilter {
  return value === "all" || value === "search" || value === "social" || value === "display";
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
  const objective = selectedObjectiveOption();
  const autonomy =
    (document.querySelector<HTMLButtonElement>(".choice-card.selected")?.dataset
      .autonomy as AutonomyLevel | undefined) ?? "approval_only";
  return {
    name: product,
    objective: objective.id,
    target_audience: "Tact UI generated audience",
    total_budget_jpy: budget,
    channels: objective.channels,
    kpis: objective.kpis,
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
  if (isDemoMode) return source === "model" ? "自動推定" : "テスト用の数字";
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
  if (isDemoMode) return "テスト用";
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
