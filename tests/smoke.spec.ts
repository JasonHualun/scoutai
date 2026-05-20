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

async function mockFavoriteMatches(page: Page) {
  await page.route("**/api/football/all", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fixtures: [
          {
            fixture: {
              id: 91001,
              date: "2026-05-23T18:30:00+00:00",
              status: { short: "NS", elapsed: null },
            },
            league: { id: 39, name: "Premier League", round: "Regular Season - 37" },
            teams: {
              home: { name: "Arsenal" },
              away: { name: "Chelsea" },
            },
            goals: { home: null, away: null },
          },
          {
            fixture: {
              id: 91002,
              date: "2026-05-23T19:15:00+00:00",
              status: { short: "NS", elapsed: null },
            },
            league: { id: 78, name: "Bundesliga", round: "Regular Season - 34" },
            teams: {
              home: { name: "Bayern Munich" },
              away: { name: "Borussia Dortmund" },
            },
            goals: { home: null, away: null },
          },
          {
            fixture: {
              id: 91003,
              date: "2026-05-23T20:00:00+00:00",
              status: { short: "NS", elapsed: null },
            },
            league: { id: 135, name: "Serie A", round: "Regular Season - 37" },
            teams: {
              home: { name: "Inter" },
              away: { name: "AC Milan" },
            },
            goals: { home: null, away: null },
          },
        ],
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
  await page.getByRole("button", { name: "实时优先" }).click({ force: true });
  await expect(page.locator("body")).toContainText("北京时间");
  await expect(page.locator("body")).not.toContainText(/AM|PM|上午|下午/);

  await mockUpcomingMatch(page, 12346);
  await page.goto("/match/12346", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("阿森纳").first()).toBeVisible({ timeout: 20_000 });

  await expect(page.getByRole("heading", { name: "模型基准估算" })).toBeVisible();
  await expect(page.getByText("不是真实盘口数据")).toBeVisible();
  await expect(page.getByRole("heading", { name: "模型委员会深度预测" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "本场购买参考" })).toBeVisible();
  await expect(page.getByText("调整本场模拟比例")).toBeVisible();

  await expect(page.getByText("免费版 · 模型基准估算")).toBeVisible();
  await expect(page.getByText("未接真实盘口").first()).toBeVisible();
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

test("login and register require captcha", async ({ page }) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await expect(page.getByText("验证码")).toBeVisible();
  await expect(page.getByRole("button", { name: "换一张" })).toBeVisible();
  await page.getByPlaceholder("you@example.com").fill("captcha-test@example.com");
  await page.getByPlaceholder("至少 6 位密码").fill("123456");
  await page.getByPlaceholder("输入验证码").fill("0000");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("验证码错误，请重新输入")).toBeVisible();

  await page.goto("/register", { waitUntil: "networkidle" });
  await expect(page.getByText("验证码")).toBeVisible();
  await expect(page.getByRole("button", { name: "换一张" })).toBeVisible();
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

test("match detail keeps team and time when schedule comes from fallback list", async ({ page }) => {
  await page.route("**/api/match/92001", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fixture: { response: [] },
        statistics: null,
        odds: null,
        recentForm: { home: null, away: null },
        teamIds: { home: null, away: null },
      }),
    });
  });

  await page.route("**/api/football/all", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        fixtures: [
          {
            fixture: {
              id: 92001,
              date: "2026-05-24T15:00:00Z",
              status: { short: "NS", elapsed: null },
            },
            league: { id: 39, name: "Premier League", round: "Matchday 38" },
            teams: {
              home: { id: 33, name: "Manchester City" },
              away: { id: 34, name: "Arsenal" },
            },
            goals: { home: null, away: null },
          },
        ],
      }),
    });
  });

  await page.goto("/match/92001", { waitUntil: "domcontentloaded" });

  await expect(page.getByText("曼城").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("阿森纳").first()).toBeVisible();
  await expect(page.getByText("开球时间：05/24 23:00")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("未知联赛");
  await expect(page.locator("body")).not.toContainText("主队");
});

test("alerts page uses real notification controls instead of demo alerts", async ({ page }) => {
  await page.goto("/alerts", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "异常提醒" })).toBeVisible();
  await expect(page.getByRole("button", { name: "开启 Chrome 通知" })).toBeVisible();
  await expect(page.getByText("演示数据")).toHaveCount(0);

  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "发送测试通知" }).click();
  await expect(page.getByText("ScoutAI 通知测试")).toBeVisible();
});

test("favorites page shows portfolio recommendations for saved matches", async ({ page }) => {
  await mockFavoriteMatches(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("scoutai_favorites", JSON.stringify([91001, 91002, 91003]));
  });

  await page.goto("/favorites", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "收藏组合推演" })).toBeVisible();
  await expect(page.getByText("单场优先")).toBeVisible();
  await expect(page.getByText("按设置页自动匹配")).toBeVisible();
  await expect(page.getByRole("link", { name: "去设置修改" })).toBeVisible();
  await expect(page.getByRole("button", { name: /稳健组合/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /机会组合/ })).toHaveCount(0);
  await expect(page.getByText("组合总模拟")).toBeVisible();
  await expect(page.getByText("剩余模拟积分")).toBeVisible();
  await expect(page.getByText("分析口径")).toBeVisible();
  await expect(page.getByText("置信度").first()).toBeVisible();
  await page.getByRole("button", { name: "开通 Pro" }).click();
  await expect(page.getByRole("heading", { name: "开通 Pro 收藏组合" })).toBeVisible();
  await expect(page.getByText("阿森纳 vs 切尔西").first()).toBeVisible();
});
