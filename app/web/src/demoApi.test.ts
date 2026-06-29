import { describe, expect, it } from "vitest";

import { demoApi } from "./demoApi";
import type { CampaignBrief, DashboardMetric, Role } from "./types";

const brief: CampaignBrief = {
  name: "デモ商品",
  objective: "conversion",
  target_audience: "テスト用の顧客",
  total_budget_jpy: 500_000,
  channels: ["search", "social", "display"],
  kpis: ["roas", "conversions"],
  tone: "clear",
  autonomy_level: "approval_only",
};

describe("demoApi", () => {
  it("runs the static demo flow without measured or real-data claims", async () => {
    await demoApi.devToken("operator");
    const created = await demoApi.createProposal(brief);
    await demoApi.refreshMeasurements(created.id);
    await demoApi.runLegalCheck(created.id);
    const pending = await demoApi.requestPublish(created.id);
    const action = pending.actions[0];

    await demoApi.devToken("approver");
    const scoped = (await demoApi.listCampaigns())[0];
    expect(scoped.media_plan.request_id).toBe("redacted");
    expect(scoped.actions[0].payload).toEqual({});
    await demoApi.approveAction(scoped.id, action.id);
    await demoApi.evaluateKillSwitch(scoped.id);
    await demoApi.requestKillSwitchStop(scoped.id);

    const dashboard = await demoApi.getDashboard(scoped.id, "28d", "all");
    const metrics: DashboardMetric[] = [
      ...dashboard.kpis,
      ...dashboard.channels.flatMap((channel) => [
        channel.planned_budget_jpy,
        channel.ad_spend_jpy,
        channel.roas,
        channel.cpa_jpy,
        channel.conversions,
      ]),
    ];
    expect(metrics.every((metric) => metric.data_kind == null || metric.data_kind === "simulated"))
      .toBe(true);
    expect(JSON.stringify(dashboard)).not.toContain("実データ");
    expect(JSON.stringify(dashboard)).not.toContain("measured");

    await demoApi.devToken("admin");
    const roles = await demoApi.listRoles();
    expect(roles.map((assignment) => assignment.roles[0]).sort()).toEqual(
      (["admin", "approver", "operator", "viewer"] satisfies Role[]).sort(),
    );
    await demoApi.updateRole("demo-viewer", ["approver"]);
    const audit = await demoApi.listAudit(scoped.id);
    expect(audit.some((entry) => entry.event_type === "role.assignment.updated")).toBe(true);
  });
});
