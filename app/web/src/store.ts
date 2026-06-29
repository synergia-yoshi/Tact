import type {
  AuditEntry,
  AuditVerificationResult,
  CampaignDashboard,
  CampaignProposal,
  DashboardChannelFilter,
  DashboardPeriod,
  DevTokenResponse,
  Role,
  RoleAssignment,
  RouteName,
  UiError,
} from "./types";

export type LoadingOperation =
  | "switchRole"
  | "createCampaign"
  | "runPublishGate"
  | "approveAction"
  | "loadDashboard"
  | "checkKillSwitch"
  | "requestKillSwitchStop"
  | "loadAudit"
  | "verifyAudit"
  | "loadRoles"
  | "updateRoleAssignment";

export interface LoadingState {
  operation: LoadingOperation;
  targetId?: string;
  role?: Role;
  phase?: string;
}

export interface AppState {
  route: RouteName;
  role: Role;
  auth: DevTokenResponse | null;
  campaigns: CampaignProposal[];
  activeCampaignId: string | null;
  dashboard: CampaignDashboard | null;
  dashboardFilters: {
    period: DashboardPeriod;
    channel: DashboardChannelFilter;
  };
  auditEntries: AuditEntry[];
  roleAssignments: RoleAssignment[];
  loading: LoadingState | null;
  failedOperation: LoadingState | null;
  error: UiError | null;
  auditVerification: AuditVerificationResult | null;
  devTokenAvailable: boolean | null;
}

type Listener = (state: AppState) => void;

const state: AppState = {
  route: "home",
  role: "operator",
  auth: null,
  campaigns: [],
  activeCampaignId: null,
  dashboard: null,
  dashboardFilters: {
    period: "28d",
    channel: "all",
  },
  auditEntries: [],
  roleAssignments: [],
  loading: null,
  failedOperation: null,
  error: null,
  auditVerification: null,
  devTokenAvailable: null,
};

const listeners = new Set<Listener>();

export function getState(): AppState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch);
  listeners.forEach((listener) => listener(state));
}

export function activeCampaign(): CampaignProposal | null {
  return state.campaigns.find((campaign) => campaign.id === state.activeCampaignId) ?? null;
}

export function upsertCampaign(campaign: CampaignProposal): void {
  const index = state.campaigns.findIndex((item) => item.id === campaign.id);
  if (index >= 0) {
    state.campaigns.splice(index, 1, campaign);
  } else {
    state.campaigns.unshift(campaign);
  }
  state.activeCampaignId = campaign.id;
  setState({ campaigns: [...state.campaigns], activeCampaignId: campaign.id });
}
