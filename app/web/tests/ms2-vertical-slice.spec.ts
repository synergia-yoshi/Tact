import { expect, test } from "@playwright/test";

test("operator creates a proposal, gates publish, and approver submits to dashboard", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "ホーム" })).toBeVisible();
  await expect(page.getByRole("button", { name: "成果" })).toBeVisible();
  await expect(page.getByText("安全な確認モード")).toBeVisible();
  await expect(page.locator("#generation-stepper-content").getByText("宣伝内容の入力")).toBeVisible();
  await expect(page.getByText("費用対効果を最大化")).toBeVisible();
  await expect(page.getByText("費用を抑える")).toHaveCount(0);
  await expect(page.locator(".choice-card")).toHaveCount(2);
  await expect(page.getByText("おまかせ")).toBeVisible();
  await expect(page.getByText("一緒に")).toBeVisible();
  await expect(page.getByText("全部まかせる")).toHaveCount(0);
  await expect(page.getByText("どちらを選んでも、広告を出す前・予算変更は必ず人が確認します。")).toBeVisible();

  await page.locator("#budget-range").evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = "500";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#budget-value")).toHaveText("¥5,000,000");

  const proposalResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/campaigns/proposals") &&
      response.status() === 201,
  );
  await page.getByRole("button", { name: /広告案を作成する/ }).click();
  const proposal = await proposalResponsePromise.then((response) => response.json());
  expect(proposal.brief.total_budget_jpy).toBe(5_000_000);
  const allocatedBudget = proposal.media_plan.placements.reduce(
    (total: number, placement: { budget_jpy: number }) => total + placement.budget_jpy,
    0,
  );
  expect(allocatedBudget).toBe(5_000_000);
  await expect(page.locator("#creative-title")).toBeVisible();
  const creativeView = page.locator("#view-creative");
  await expect(creativeView.getByText("テスト用の案 / 広告文")).toBeVisible();
  await expect(
    creativeView.getByText("予測 / テスト用", { exact: true }),
  ).toBeVisible();
  await expect(creativeView.getByText("実際に終わった作業だけ表示")).toBeVisible();
  await expect(creativeView.getByText("見せかけなし")).toBeVisible();
  await expect(creativeView.getByText("テスト用の数字").first()).toBeVisible();
  await expect(creativeView.locator(".generation-step.complete")).toHaveCount(3);
  const reachConfidence = Math.round(
    proposal.media_plan.estimated_reach_range.confidence * 100,
  );
  await expect(creativeView.getByText(`確かさ ${reachConfidence}%`)).toBeVisible();

  await page.getByRole("button", { name: "成果" }).click();
  await expect(page.getByText("計測が入るまで、成果のグラフは表示しません。")).toBeVisible();
  await expect(page.locator("#performance-chart")).toHaveCount(0);
  await expect(page.getByText("媒体別ステータス")).toBeVisible();
  await page.getByRole("button", { name: "広告素材" }).click();

  await page.getByRole("button", { name: "出す前の確認へ進む" }).click();
  await expect(page.locator("#tasks-title")).toBeVisible();
  await expect(
    page.locator("#view-tasks .approval-item .data-label").getByText("確認待ち"),
  ).toBeVisible();
  await expect(page.locator("#view-tasks .generation-step.complete")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "広告を出すことを承認" })).toHaveCount(0);
  await expect(page.getByText("承認者・管理者のみ")).toBeVisible();

  await page.getByRole("button", { name: "承認者" }).click();
  await page.getByRole("button", { name: "広告を出すことを承認" }).click();
  await expect(page.locator("#dashboard-title")).toBeVisible();
  await expect(page.getByText("広告を出した状態 / テスト用の結果")).toBeVisible();
  await expect(page.getByText("媒体別ステータス")).toBeVisible();
  await expect(page.locator(".channel-row")).toHaveCount(3);
  await expect(page.getByText("改善ループ履歴")).toBeVisible();
  await expect(page.getByText("次の改善案")).toBeVisible();
  await expect(page.getByText("Kill Switch")).toBeVisible();
  await expect(page.locator("#performance-chart")).toBeVisible();
  await expect(page.getByText("履歴あり")).toBeVisible();
  await expect(page.getByText("データなし").first()).toBeVisible();

  await page.getByRole("button", { name: "SNS" }).click();
  await expect(page.locator(".channel-row")).toHaveCount(1);
  await expect(page.locator(".channel-status-list").getByText("SNS広告")).toBeVisible();
  await page.getByRole("button", { name: "全体" }).click();
  await expect(page.locator(".channel-row")).toHaveCount(3);

  await page.locator("#performance-chart").evaluate((element) => {
    element.setAttribute("data-probe", "stable");
  });
  await page.getByRole("button", { name: "担当者" }).click();
  await expect(page.locator("[data-kill-stop]")).toBeDisabled();
  await expect(page.locator("#performance-chart")).toHaveAttribute("data-probe", "stable");
  await page.getByRole("button", { name: "承認者" }).click();
  await expect(page.locator("#performance-chart")).toHaveAttribute("data-probe", "stable");
  await expect(page.locator("[data-kill-stop]")).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".dash-top .kpi-card").first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);

  await page.locator("[data-kill-stop]").click();
  await expect(page.locator(".kill-panel").getByText("停止想定")).toBeVisible();
  await expect(page.getByRole("button", { name: "広告素材" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "設定" })).toHaveCount(0);
  await page.getByRole("button", { name: "管理者" }).click();
  await page.getByRole("button", { name: "記録" }).click();
  await expect(
    page.locator("#audit-content .data-label").getByText("止める想定を確認", { exact: true }),
  ).toBeVisible();
});

test("admin-only audit verification is surfaced in the UI", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /広告案を作成する/ }).click();
  await page.getByRole("button", { name: "記録" }).click();
  await expect(page.getByText("変更できない操作記録")).toBeVisible();

  await expect(page.getByRole("button", { name: "記録を検証" })).toBeDisabled();

  await page.getByRole("button", { name: "管理者" }).click();
  await page.getByRole("button", { name: "記録を検証" }).click();
  await expect(page.getByText(/記録のつながりは正常・\d+件/)).toBeVisible();
});

test("create proposal disables the submit button while the request is in flight", async ({
  page,
}) => {
  let createCalls = 0;
  await page.route("**/api/v1/campaigns/proposals", async (route) => {
    createCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByText("安全な確認モード")).toBeVisible();

  const createButton = page.getByRole("button", { name: /広告案を作成する/ });
  await createButton.click();
  await expect(page.getByRole("button", { name: /作成中/ })).toBeDisabled();
  await expect(page.locator("#generation-stepper-content .generation-status").first()).toHaveText("進行中");
  await expect(page.locator("#creative-title")).toBeVisible();
  expect(createCalls).toBe(1);
});

test("settings shows honest data integration status and admin-only connection path", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "設定" })).toHaveCount(0);
  await page.getByRole("button", { name: "管理者" }).click();
  await page.getByRole("button", { name: "設定" }).click();
  await expect(page.getByRole("heading", { name: "データ連携" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "計測・解析" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ネットショップ・決済" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "広告媒体" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "顧客・連絡" })).toBeVisible();
  const integrationNames = [
    "Googleアナリティクス（GA4）",
    "Google Search Console",
    "Metaピクセル",
    "Shopify",
    "BASE",
    "STORES",
    "楽天市場",
    "Amazon",
    "Stripe",
    "Google広告",
    "Yahoo!広告",
    "Meta広告（Facebook/Instagram）",
    "X広告",
    "TikTok広告",
    "LINE広告",
    "Microsoft広告",
    "LINE公式アカウント",
    "Mailchimp",
  ];
  for (const name of integrationNames) {
    await expect(page.locator(".integration-meta strong").getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.locator('[data-integration-status="test"]')).toHaveCount(3);
  await expect(page.locator('[data-integration-status="coming_soon"]')).toHaveCount(15);
  await expect(page.locator("[data-integration-connect]")).toHaveCount(3);
  await expect(page.getByText("接続済み")).toHaveCount(0);

  const firstConnectButton = page.locator("[data-integration-connect]").first();
  await expect(firstConnectButton).toBeEnabled();
  await firstConnectButton.click();
  await expect(page.getByText("APIキーはこの画面では扱いません")).toBeVisible();
});

test("primary surfaces stay responsive across target widths", async ({ page }) => {
  await page.goto("/");
  await page.locator("#create-button").click();
  await expect(page.locator("#creative-title")).toBeVisible();
  await page.locator('[data-role="admin"]').click();
  await expect(page.locator('[data-role="admin"]')).toHaveClass(/active/);

  const routes = [
    "home",
    "campaigns",
    "dashboard",
    "tasks",
    "creative",
    "audit",
    "roles",
    "settings",
  ];
  const widths = [360, 390, 768, 1024, 1280, 1440];

  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 900 });
    for (const route of routes) {
      await page.locator(`[data-route="${route}"]`).first().click();
      await page.waitForTimeout(40);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
    }

    const smallButtons = await page.locator("button:visible").evaluateAll((buttons) =>
      buttons
        .map((button) => {
          const rect = button.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .filter((rect) => rect.width < 44 || rect.height < 44),
    );
    expect(smallButtons).toEqual([]);
  }
});
