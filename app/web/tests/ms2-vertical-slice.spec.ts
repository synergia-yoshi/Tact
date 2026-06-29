import { expect, test } from "@playwright/test";

test("operator creates a proposal, gates publish, and approver submits to dashboard", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "ホーム" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ダッシュボード" })).toBeVisible();
  await expect(page.getByText("signed_bearer 接続")).toBeVisible();

  await page.getByRole("button", { name: /プランを作成する/ }).click();
  await expect(page.locator("#creative-title")).toBeVisible();
  const creativeView = page.locator("#view-creative");
  await expect(creativeView.getByText("サーバー生成コピー")).toBeVisible();
  await expect(
    creativeView.getByText("予測 / シミュレーション", { exact: true }),
  ).toBeVisible();
  await expect(creativeView.getByText(/信頼度 62%/)).toBeVisible();

  await page.getByRole("button", { name: "配信ゲートを実行" }).click();
  await expect(page.locator("#tasks-title")).toBeVisible();
  await expect(
    page.locator("#view-tasks").getByText("pending_approval", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page.getByText("この操作を実行する権限がありません")).toBeVisible();

  await page.getByRole("button", { name: "approver" }).click();
  await page.getByRole("button", { name: "承認する" }).click();
  await expect(page.locator("#dashboard-title")).toBeVisible();
  await expect(page.getByText("配信済み / mock媒体はシミュレーション")).toBeVisible();
  await expect(page.getByText("Kill Switch:")).toBeVisible();
  await expect(page.locator("#performance-chart")).toBeVisible();
});

test("admin-only audit verification is surfaced in the UI", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /プランを作成する/ }).click();
  await page.getByRole("button", { name: "監査" }).click();
  await expect(page.getByText("append-only hash chain")).toBeVisible();

  await page.getByRole("button", { name: "hash chain verify" }).click();
  await expect(page.getByText("この操作を実行する権限がありません")).toBeVisible();

  await page.getByRole("button", { name: "admin" }).click();
  await page.getByRole("button", { name: "hash chain verify" }).click();
  await expect(page.getByText(/verify:/)).toBeVisible();
  await expect(page.getByText(/"valid":true/)).toBeVisible();
});
