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
  "/backtest",
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

  await page.route("**/api/match/910**", async (route) => {
    const url = new URL(route.request().url());
    const id = Number(url.pathname.split("/").pop());
    const oddsById: Record<number, [number, number, number]> = {
      91001: [1.82, 3.65, 4.4],
      91002: [2.15, 3.75, 3.05],
      91003: [2.55, 3.1, 2.85],
    };
    const [homeWin, draw, awayWin] = oddsById[id] ?? [2, 3.3, 3.6];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        statistics: {
          response: [
            {
              statistics: [
                { type: "Ball Possession", value: "56%" },
                { type: "Total Shots", value: 12 },
                { type: "Shots on Target", value: 5 },
                { type: "Corner Kicks", value: 6 },
                { type: "Expected Goals", value: 1.6 },
              ],
            },
            {
              statistics: [
                { type: "Ball Possession", value: "44%" },
                { type: "Total Shots", value: 9 },
                { type: "Shots on Target", value: 3 },
                { type: "Corner Kicks", value: 4 },
                { type: "Expected Goals", value: 1.1 },
              ],
            },
          ],
        },
        odds: {
          response: [
            {
              bookmakers: [
                {
                  bets: [
                    {
                      name: "Match Winner",
                      values: [
                        { value: "Home", odd: String(homeWin) },
                        { value: "Draw", odd: String(draw) },
                        { value: "Away", odd: String(awayWin) },
                      ],
                    },
                    { name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: "1.9" }] },
                    { name: "Asian Handicap", values: [{ value: "Home -0.25", odd: "1.95" }] },
                  ],
                },
              ],
            },
          ],
        },
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

test("backtest page renders model validation metrics", async ({ page }) => {
  await page.goto("/backtest", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "模型回测" })).toBeVisible();
  await expect(page.getByText("内置案例样本").first()).toBeVisible();
  await expect(page.getByText("案例净增")).toBeVisible();
  await expect(page.getByText("起始 1000 分 · 结束 1286 分")).toBeVisible();
  await expect(page.getByText("命中率").first()).toBeVisible();
  await expect(page.getByText("最大回撤").first()).toBeVisible();
  await expect(page.getByText("Brier 分数").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "精选案例明细" })).toBeVisible();
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
  await expect(page.getByText("调整本场占比")).toBeVisible();

  await expect(page.getByText("免费版 · 模型基准估算")).toBeVisible();
  await expect(page.getByText("未接真实盘口").first()).toBeVisible();
  await expect(page.getByText("Pro 高级版 · 首单 ¥69.9")).toBeVisible();
  await page.getByRole("button", { name: /解锁 Pro|生成 Pro 分析/ }).click();
  await expect(page.getByRole("heading", { name: "首单 Pro 体验：把难懂的比赛先筛掉" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("原价 ¥99.9").first()).toBeVisible();
  await expect(page.getByText("预计预测 10 场比赛结果")).toBeVisible();
  await expect(page.getByText("¥299")).toBeVisible();
  await expect(page.getByText("¥699")).toBeVisible();
  await expect(page.getByText("用户专属优惠倒计时")).toBeVisible();
  await expect(page.getByText("微信支付")).toBeVisible();
  await expect(page.getByText("支付宝")).toBeVisible();
  await expect(page.getByText("付款完成后，通常 30 分钟内开通或补充积分；非工作时间会顺延处理。")).toBeVisible();
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

test("settings save action appears only while needed", async ({ page }) => {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page.getByRole("button", { name: "保存全部设置" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "风险偏好" })).toBeVisible();

  const aggressiveButton = page.getByRole("button", { name: /进取型/ });
  await expect(aggressiveButton).toBeVisible();
  await expect(aggressiveButton).toBeEnabled();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await aggressiveButton.click({ force: true });
    if ((await page.getByRole("button", { name: "保存全部设置" }).count()) > 0) break;
    await page.waitForTimeout(400);
  }
  await expect(page.getByRole("button", { name: "保存全部设置" })).toBeVisible();
  await expect(page.getByText("有修改未保存")).toBeVisible();

  await page.getByRole("button", { name: "保存全部设置" }).click();
  await expect(page.getByRole("button", { name: "已保存" })).toBeVisible();
  await expect(page.getByRole("button", { name: "已保存" })).toBeHidden({ timeout: 3_000 });
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
  await expect(page.getByText("只监控你收藏里的比赛")).toBeVisible();
  await expect(page.getByText("收藏监控 0 场")).toBeVisible();
  await expect(page.getByRole("button", { name: "开启 Chrome 通知" })).toBeVisible();
  await expect(page.getByText("演示数据")).toHaveCount(0);

  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "发送测试通知" }).click();
  await expect(page.getByText("ScoutAI 通知测试")).toBeVisible();
  await expect(page.getByText("网页内测试预览", { exact: true })).toBeVisible();
  await expect(page.getByText("不计入未读")).toBeVisible();
});

test("alerts only monitor favorite matches and surface live data changes", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("scoutai_favorites", JSON.stringify([77001]));
    window.localStorage.setItem(
      "scoutai:live-alert-snapshot",
      JSON.stringify({
        "77001": {
          id: "77001",
          match_name: "阿森纳 vs 切尔西",
          homeTeam: "阿森纳",
          awayTeam: "切尔西",
          homeScore: 0,
          awayScore: 0,
          status: "live",
          yellowCardsHome: 0,
          yellowCardsAway: 0,
          cornersHome: 1,
          cornersAway: 0,
        },
      })
    );
  });

  await page.route("**/api/football/live", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        matches: [
          {
            id: 77001,
            league: "英超",
            homeTeam: "阿森纳",
            awayTeam: "切尔西",
            homeScore: 1,
            awayScore: 0,
            status: "live",
            minute: 62,
          },
          {
            id: 77002,
            league: "英超",
            homeTeam: "曼城",
            awayTeam: "热刺",
            homeScore: 2,
            awayScore: 0,
            status: "live",
            minute: 62,
          },
        ],
      }),
    });
  });

  await page.route("**/api/match/77001", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        statistics: {
          response: [
            {
              statistics: [
                { type: "Yellow Cards", value: 1 },
                { type: "Corner Kicks", value: 2 },
              ],
            },
            {
              statistics: [
                { type: "Yellow Cards", value: 0 },
                { type: "Corner Kicks", value: 0 },
              ],
            },
          ],
        },
        odds: { response: [] },
      }),
    });
  });

  await page.goto("/alerts", { waitUntil: "networkidle" });

  await expect(page.getByText("收藏监控 1 场")).toBeVisible();
  await expect(page.getByText("阿森纳 vs 切尔西").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("body")).toContainText("阿森纳 出现进球");
  await expect(page.locator("body")).toContainText("阿森纳 新增 1 次黄牌");
  await expect(page.locator("body")).toContainText("阿森纳 新增 1 次角球");
  await expect(page.locator("body")).not.toContainText("曼城 vs 热刺");
});

test("favorites page shows portfolio recommendations for saved matches", async ({ page }) => {
  await mockFavoriteMatches(page);
  await page.addInitScript(() => {
    window.localStorage.setItem("scoutai_favorites", JSON.stringify([91001, 91002, 91003]));
  });

  await page.goto("/favorites", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { name: "收藏预测推荐" })).toBeVisible();
  await expect(page.getByText("开始本次预测")).toBeVisible();
  await expect(page.getByText("开通 Pro 后预测")).toBeVisible();
  await expect(page.getByText("按设置页自动匹配")).toBeVisible();
  await expect(page.getByRole("link", { name: "去设置修改" })).toBeVisible();
  await expect(page.getByRole("button", { name: /稳健组合/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /机会组合/ })).toHaveCount(0);
  await expect(page.getByText("剩余预测积分")).toBeVisible();
  await expect(page.getByText("分析口径")).toBeVisible();
  await expect(page.getByText("信号强度").first()).toBeVisible();
  await page.getByRole("button", { name: "开通 Pro", exact: true }).click();
  await expect(page.getByRole("heading", { name: "开通 Pro 预测积分" })).toBeVisible();
  await expect(page.getByText("用户专属优惠倒计时")).toBeVisible();
  await expect(page.getByText("¥299")).toBeVisible();
  await expect(page.getByText("¥699")).toBeVisible();
  await expect(page.getByText("阿森纳 vs 切尔西").first()).toBeVisible();
});
