import { expect, test } from "@playwright/test";

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

  const firstMatch = page.locator('a[href^="/match/"]').first();
  await expect(firstMatch).toBeVisible({ timeout: 20_000 });
  await Promise.all([
    page.waitForURL(/\/match\/\d+/, { timeout: 20_000 }),
    firstMatch.click(),
  ]);

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
