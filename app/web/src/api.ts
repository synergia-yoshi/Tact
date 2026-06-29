import type {
  AuditEntry,
  AuditVerificationResult,
  CampaignBrief,
  CampaignDashboard,
  CampaignProposal,
  DashboardChannelFilter,
  DashboardPeriod,
  DevTokenResponse,
  KillSwitchResult,
  MetricSnapshot,
  Role,
  UiError,
} from "./types";

let bearerToken: string | null = null;

export function setBearerToken(token: string | null): void {
  bearerToken = token;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body != null) {
    headers.set("Content-Type", "application/json");
  }
  if (bearerToken != null) {
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    throw await toUiError(response);
  }
  return (await response.json()) as T;
}

async function toUiError(response: Response): Promise<UiError> {
  let detail = response.statusText;
  try {
    const payload = (await response.json()) as { detail?: unknown };
    detail = typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
  } catch {
    detail = response.statusText;
  }
  return {
    status: response.status,
    detail,
    message: humanizeStatus(response.status, detail),
  };
}

export function humanizeStatus(status: number, detail: string): string {
  if (status === 401) return "確認が必要です。権限を選び直して、もう一度お試しください。";
  if (status === 403) return "この操作を実行する権限がありません。承認者または管理者に切り替えてください。";
  if (status === 404) return "対象の広告案またはデータが見つかりません。";
  if (status === 409) return translateConflict(detail);
  return `システムで問題が発生しました: ${detail}`;
}

function translateConflict(detail: string): string {
  if (detail.includes("Measurement snapshot")) {
    return "広告を出す前に数字の確認結果が必要です。数字の確認を実行してください。";
  }
  if (detail.includes("Passed legal check")) {
    return "広告を出す前に表現の確認が必要です。表現の確認を実行してください。";
  }
  if (detail.includes("pending approval")) {
    return "この操作は確認待ちではありません。最新状態を確認してください。";
  }
  return `操作の前提条件が満たされていません: ${detail}`;
}

export const api = {
  devToken(role: Role): Promise<DevTokenResponse> {
    return requestJson<DevTokenResponse>("/api/v1/auth/dev-token", {
      method: "POST",
      body: JSON.stringify({ role }),
    });
  },
  listCampaigns(): Promise<CampaignProposal[]> {
    return requestJson<CampaignProposal[]>("/api/v1/campaigns");
  },
  createProposal(brief: CampaignBrief): Promise<CampaignProposal> {
    return requestJson<CampaignProposal>("/api/v1/campaigns/proposals", {
      method: "POST",
      body: JSON.stringify(brief),
    });
  },
  getDashboard(
    campaignId: string,
    period: DashboardPeriod,
    channel: DashboardChannelFilter,
  ): Promise<CampaignDashboard> {
    const params = new URLSearchParams({ period, channel });
    return requestJson<CampaignDashboard>(
      `/api/v1/campaigns/${campaignId}/dashboard?${params.toString()}`,
    );
  },
  refreshMeasurements(campaignId: string): Promise<MetricSnapshot> {
    return requestJson<MetricSnapshot>(`/api/v1/campaigns/${campaignId}/measurements/refresh`, {
      method: "POST",
    });
  },
  runLegalCheck(campaignId: string): Promise<unknown> {
    return requestJson<unknown>(`/api/v1/campaigns/${campaignId}/legal-checks/run`, {
      method: "POST",
    });
  },
  requestPublish(campaignId: string): Promise<CampaignProposal> {
    return requestJson<CampaignProposal>(`/api/v1/campaigns/${campaignId}/publish`, {
      method: "POST",
    });
  },
  approveAction(campaignId: string, actionId: string): Promise<CampaignProposal> {
    return requestJson<CampaignProposal>(
      `/api/v1/campaigns/${campaignId}/actions/${actionId}/approve`,
      { method: "POST" },
    );
  },
  evaluateKillSwitch(campaignId: string): Promise<KillSwitchResult> {
    return requestJson<KillSwitchResult>(
      `/api/v1/campaigns/${campaignId}/kill-switch/evaluate`,
      { method: "POST" },
    );
  },
  requestKillSwitchStop(campaignId: string): Promise<KillSwitchResult> {
    return requestJson<KillSwitchResult>(
      `/api/v1/campaigns/${campaignId}/kill-switch/stop-simulation`,
      { method: "POST" },
    );
  },
  listAudit(campaignId: string): Promise<AuditEntry[]> {
    return requestJson<AuditEntry[]>(`/api/v1/campaigns/${campaignId}/audit`);
  },
  verifyAudit(): Promise<AuditVerificationResult> {
    return requestJson<AuditVerificationResult>("/api/v1/campaigns/audit/verify");
  },
};
