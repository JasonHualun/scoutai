import { expect, test, type Page } from "@playwright/test";

const routes = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/settings",
  "/alerts",
  "/favorites",
  "/support",
];
const mojibakePattern = /[鑻鐧璧鍏鍗鈿馃�]/;

async function mockUpcomingMatch(page: Page, fixtureId: number) {
  await page.route(`**/api/match/${fixtureId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fixture: {
          response: [
            {
              fixture: {
                id: fixtureId,
                date: "2026-05-23T18:30:00+00:00",
                status: { short: "NS", elapsed: null },
              },
              league: { name: "Premier League", round: "Regular Season - 37" },
              teams: {
                home: { id: 1, name: "Arsenal" },
                away: { id: 2, name: "Chelsea" },
              },
              goals: { home: null, away: null },
            },
          ],
        },
        statistics: {
          response: [
            { team: { id: 1, name: "Arsenal" }, statistics: [] },
            { team: { id: 2, name: "Chelsea" }, statistics: [] },
          ],
        },
        odds: { response: [] },
        recentForm: { home: null, away: null },
        teamIds: { home: 1, away: 2 },
      }),
    });
  });
}

test("core pages render without mojibake", async ({ page }) => {
  for (const route of routes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), route).toBeLessThan(500);
    await expect(page.locator("body")).not.toContainText(mojibakePattern);
  }
});

test("match detail flow can generate a local analysis", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "五大联赛 + 世界杯" })).toHaveCount(0);
  await page.getByRole("button", { name: "实时优先" }).click();
  await expect(page.locator("body")).toContainText("北京时间");
  await expect(page.locator("body")).not.toContainText(/AM|PM|上午|下午/);

  await mockUpcomingMatch(page, 12346);
  const matchResponse = page.waitForResponse((response) =>
    response.url().includes("/api/match/12346")
  );
  await page.goto("/match/12346", { waitUntil: "domcontentloaded" });
  await matchResponse;

  await expect(page.getByRole("heading", { name: "概率预测" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "模型委员会深度预测" })).toBeVisible();

  await expect(page.getByText("免费版 · 基础预测")).toBeVisible();
  await expect(page.getByText("Pro 高级版 · ¥69.9/月")).toBeVisible();
  await page.getByRole("button", { name: /解锁 Pro|生成 Pro 分析/ }).click();
  await expect(page.getByRole("heading", { name: "首月 Pro 体验：把难懂的比赛先筛掉" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("原价 ¥199/月")).toBeVisible();
  await expect(page.getByText("今日优惠倒计时")).toBeVisible();
  await expect(page.getByText("微信支付")).toBeVisible();
  await expect(page.getByText("支付宝")).toBeVisible();
  await expect(page.getByText("付款完成后，通常 30 分钟内人工开通。")).toBeVisible();
});

test("upcoming match does not show fake realtime stats", async ({ page }) => {
  await mockUpcomingMatch(page, 12345);

  const matchResponse = page.waitForResponse((response) =>
    response.url().includes("/api/match/12345")
  );
  await page.goto("/match/12345", { waitUntil: "domcontentloaded" });
  await matchResponse;

  await expect(page.getByText("等待开赛")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("比赛还未开始，控球、射门、xG 等实时数据会在开赛后更新。")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("当前接口暂未返回真实赔率，价值差暂不计算。")).toBeVisible();
  await expect(page.getByText("暂无近况数据")).toHaveCount(2);
  await expect(page.locator("body")).not.toContainText("50%");
  await expect(page.locator("body")).not.toContainText("1.35");
});
