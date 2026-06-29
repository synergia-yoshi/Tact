import type {
  AuditEntry,
  CampaignBrief,
  CampaignProposal,
  DevTokenResponse,
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
  if (status === 401) return "認証が必要です。ロールを選び直して、期限付きトークンを取得してください。";
  if (status === 403) return "この操作を実行する権限がありません。approver または admin に切り替えてください。";
  if (status === 404) return "対象のキャンペーンまたはデータが見つかりません。";
  if (status === 409) return translateConflict(detail);
  return `サーバーで問題が発生しました: ${detail}`;
}

function translateConflict(detail: string): string {
  if (detail.includes("Measurement snapshot")) {
    return "配信前に計測スナップショットが必要です。計測チェックを実行してください。";
  }
  if (detail.includes("Passed legal check")) {
    return "配信前に法務チェックの pass が必要です。法務チェックを実行してください。";
  }
  if (detail.includes("pending approval")) {
    return "このアクションは承認待ちではありません。最新状態を確認してください。";
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
  listAudit(campaignId: string): Promise<AuditEntry[]> {
    return requestJson<AuditEntry[]>(`/api/v1/campaigns/${campaignId}/audit`);
  },
  verifyAudit(): Promise<unknown> {
    return requestJson<unknown>("/api/v1/campaigns/audit/verify");
  },
};
